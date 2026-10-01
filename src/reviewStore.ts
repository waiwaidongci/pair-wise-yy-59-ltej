import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDisclosureStore, type DisclosureRecord, type Redaction } from './store';

// 复核台账架构版本：旧草稿无快照版本，进入时先兼容升级。
export const REVIEW_SCHEMA_VERSION = 1;
export const RELEASE_BATCH_MIN_SIGNATURES = 2;

export type Reviewer = { id: string; name: string; role: string };

// 两名质控员（双人复核）。
export const REVIEWERS: Reviewer[] = [
  { id: 'U-01', name: '林清', role: '审核组 · 第一签署人' },
  { id: 'U-02', name: '周叙', role: '复核组 · 第二签署人' }
];

// 复核结论：页序、元数据、各区域结论。两人结论必须一致才进入发布批次。
export type ReviewConclusions = {
  pageOrderOk: boolean;
  metadataClean: boolean;
  regionIds: string[];
};

// 发起时冻结的快照：原始页、发布页、去密区域、元数据与结论基线。
export type FrozenSnapshot = {
  snapshotVersion: number;
  frozenAt: string;
  frozenBy: string;
  pageCount: number;
  pageOrder: number[];
  title: string;
  bundle: string;
  classification: string;
  owner: string;
  regions: Redaction[];
  regionVersions: Record<string, number>;
  fingerprint: string;
};

export type Signature = {
  requestNo: string;
  reviewerId: string;
  reviewerName: string;
  signedAt: string;
  snapshotVersion: number;
  conclusions: ReviewConclusions;
  conclusionsHash: string;
  valid: boolean;
};

export type InvalidationKind = 'page-order' | 'metadata' | 'region';

export type Invalidation = {
  id: string;
  kind: InvalidationKind;
  targetId: string;
  label: string;
  reason: string;
  detectedAt: string;
  resolved: boolean;
};

export type WriteStep = { id: string; label: string; done: boolean };

// 写入台账：凭原请求号幂等恢复，重复重试沿用第一次结果，不新增签署。
export type ReviewWrite = {
  requestNo: string;
  documentId: string;
  type: 'sign' | 'refreeze';
  status: 'pending' | 'committed' | 'failed';
  steps: WriteStep[];
  payload?: { reviewerId: string; conclusions: ReviewConclusions; snapshotVersion: number };
  createdAt: string;
  committedAt?: string;
  lastCompletedStep?: string;
  resultSummary?: string;
  reused?: boolean;
};

// 并发冲突：先到版本被接收，后到者看到冲突并保留草稿。
export type ConflictDraft = {
  requestNo: string;
  reviewerId: string;
  reviewerName: string;
  conclusions: ReviewConclusions;
  snapshotVersion: number;
  keptAt: string;
  reason: string;
};

export type DocReview = {
  documentId: string;
  schemaVersion: number;
  legacyUpgraded: boolean;
  round: number;
  snapshot: FrozenSnapshot | null;
  signatures: Signature[];
  signatureHistory: Signature[];
  invalidations: Invalidation[];
  releaseBlocked: boolean;
  conflictDraft: ConflictDraft | null;
};

type SignArgs = {
  documentId: string;
  requestNo: string;
  reviewerId: string;
  conclusions: ReviewConclusions;
  snapshotVersion: number;
  simulateFailure?: boolean;
};

type ReviewState = {
  reviews: Record<string, DocReview>;
  writes: Record<string, ReviewWrite>;
  faultInjection: boolean;
  touchReview: (documentId: string) => void;
  initReview: (documentId: string, operator: string) => void;
  signReview: (args: SignArgs) => { ok: boolean; conflict?: boolean; reused?: boolean; error?: string };
  retryWrite: (requestNo: string) => { ok: boolean; reused?: boolean; error?: string };
  reconcile: (documentId: string) => void;
  resolveInvalidation: (documentId: string, invalidationId: string) => void;
  refreeze: (documentId: string, operator: string) => void;
  clearConflictDraft: (documentId: string) => void;
  setFaultInjection: (value: boolean) => void;
};

function nowIso() {
  return new Date().toISOString();
}

// 简易稳定哈希，用于页序 / 元数据 / 结论的一致性比对。
function hashString(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function emptyConclusions(): ReviewConclusions {
  return { pageOrderOk: false, metadataClean: false, regionIds: [] };
}

function conclusionsHash(c: ReviewConclusions): string {
  return hashString(JSON.stringify({
    pageOrderOk: c.pageOrderOk,
    metadataClean: c.metadataClean,
    regionIds: [...c.regionIds].sort()
  }));
}

function computeFingerprint(doc: DisclosureRecord) {
  const regionVersions: Record<string, number> = {};
  for (const r of doc.redactions) {
    regionVersions[r.id] = (r as Redaction & { version?: number }).version ?? 1;
  }
  const pageOrder = Array.from(new Set(doc.redactions.map((r) => r.page))).sort((a, b) => a - b);
  const payload = JSON.stringify({
    pages: doc.pages,
    pageOrder,
    classification: doc.classification,
    owner: doc.owner,
    title: doc.title,
    bundle: doc.bundle,
    regionVersions
  });
  return { fp: hashString(payload), regionVersions, pageOrder };
}

function buildSnapshot(doc: DisclosureRecord, version: number, frozenBy: string): FrozenSnapshot {
  const { fp, regionVersions, pageOrder } = computeFingerprint(doc);
  return {
    snapshotVersion: version,
    frozenAt: nowIso(),
    frozenBy,
    pageCount: doc.pages,
    pageOrder,
    title: doc.title,
    bundle: doc.bundle,
    classification: doc.classification,
    owner: doc.owner,
    regions: doc.redactions.map((r) => ({ ...r })),
    regionVersions,
    fingerprint: fp
  };
}

function blankReview(documentId: string): DocReview {
  return {
    documentId,
    schemaVersion: 0,
    legacyUpgraded: false,
    round: 0,
    snapshot: null,
    signatures: [],
    signatureHistory: [],
    invalidations: [],
    releaseBlocked: false,
    conflictDraft: null
  };
}

function sameConclusions(a: ReviewConclusions, b: ReviewConclusions): boolean {
  return conclusionsHash(a) === conclusionsHash(b);
}

// 进入发布批次的门禁：两人签署、同一快照版本、结论一致、无失效项。
export function releaseReadiness(review: DocReview | undefined): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!review || !review.snapshot) return { ready: false, reasons: ['尚未发起复核，缺少冻结快照'] };
  if (review.releaseBlocked) reasons.push('存在未清失效项，发布包已锁定');
  const open = review.invalidations.filter((i) => !i.resolved);
  if (open.length > 0) reasons.push(`${open.length} 项失效尚未处理`);
  if (review.signatures.length < RELEASE_BATCH_MIN_SIGNATURES) {
    reasons.push(`双人签署进度 ${review.signatures.length}/${RELEASE_BATCH_MIN_SIGNATURES}`);
  }
  if (review.signatures.length >= 2) {
    const [a, b] = review.signatures;
    if (a.snapshotVersion !== b.snapshotVersion) reasons.push('两份签署基于不同快照版本');
    if (!sameConclusions(a.conclusions, b.conclusions)) reasons.push('两人页序 / 元数据 / 区域结论不一致');
  }
  return { ready: reasons.length === 0, reasons };
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      reviews: {},
      writes: {},
      faultInjection: false,

      // 进入复核页时调用：旧草稿（无快照版本）先兼容升级，冻结首版快照。
      touchReview: (documentId) => {
        const existing = get().reviews[documentId];
        if (existing && existing.schemaVersion >= REVIEW_SCHEMA_VERSION) return;
        const doc = useDisclosureStore.getState().documents.find((d) => d.id === documentId);
        if (!doc) return;
        const upgraded = existing ?? blankReview(documentId);
        const snapshot = buildSnapshot(doc, 1, '系统兼容升级');
        set({
          reviews: {
            ...get().reviews,
            [documentId]: {
              ...upgraded,
              schemaVersion: REVIEW_SCHEMA_VERSION,
              legacyUpgraded: true,
              round: 1,
              snapshot,
              signatures: [],
              signatureHistory: upgraded.signatureHistory ?? [],
              invalidations: [],
              releaseBlocked: false,
              conflictDraft: null
            }
          }
        });
      },

      // 发起（重新冻结）：以当前文档状态冻结新一版快照。
      initReview: (documentId, operator) => {
        const doc = useDisclosureStore.getState().documents.find((d) => d.id === documentId);
        if (!doc) return;
        const prev = get().reviews[documentId] ?? blankReview(documentId);
        const version = (prev.snapshot?.snapshotVersion ?? 0) + 1;
        const snapshot = buildSnapshot(doc, version, operator);
        set({
          reviews: {
            ...get().reviews,
            [documentId]: {
              ...prev,
              schemaVersion: REVIEW_SCHEMA_VERSION,
              legacyUpgraded: prev.legacyUpgraded,
              round: prev.round + 1,
              snapshot,
              signatures: [],
              signatureHistory: [...prev.signatures.map((s) => ({ ...s, valid: false })), ...prev.signatureHistory],
              invalidations: [],
              releaseBlocked: false,
              conflictDraft: null
            }
          }
        });
      },

      // 递交签署：并发只接收先到版本，后到者见冲突并保留草稿；写入失败凭请求号幂等恢复。
      signReview: (args) => {
        const { documentId, requestNo, reviewerId, conclusions, snapshotVersion, simulateFailure } = args;
        const state = get();
        const review = state.reviews[documentId];
        if (!review || !review.snapshot) return { ok: false, error: '尚未发起复核：缺少冻结快照' };

        // 幂等：同一请求号已提交过，沿用第一次结果，不新增签署。
        const existingWrite = state.writes[requestNo];
        if (existingWrite) {
          if (existingWrite.status === 'committed') {
            set({ writes: { ...get().writes, [requestNo]: { ...existingWrite, reused: true } } });
            return { ok: true, reused: true };
          }
          if (existingWrite.status === 'failed') return get().retryWrite(requestNo);
        }

        const reviewer = REVIEWERS.find((r) => r.id === reviewerId);
        const reviewerName = reviewer?.name ?? reviewerId;
        const chash = conclusionsHash(conclusions);
        const keepDraft = (reason: string): { ok: false; conflict: true } => {
          const draft: ConflictDraft = {
            requestNo, reviewerId, reviewerName, conclusions, snapshotVersion,
            keptAt: nowIso(), reason
          };
          set({ reviews: { ...get().reviews, [documentId]: { ...get().reviews[documentId], conflictDraft: draft } } });
          return { ok: false, conflict: true };
        };

        // 快照过期：内容已变化，先到版本已接收。
        if (snapshotVersion !== review.snapshot.snapshotVersion) {
          return keepDraft(`递交基于过期快照 v${snapshotVersion}，当前冻结版本为 v${review.snapshot.snapshotVersion}；只接收先到版本，本递交保留为草稿。`);
        }
        // 与先到签署人结论冲突。
        const other = review.signatures.find((s) => s.reviewerId !== reviewerId);
        if (other && other.conclusionsHash !== chash) {
          return keepDraft(`与先到签署人 ${other.reviewerName} 的结论不一致（${chash} ≠ ${other.conclusionsHash}）；只接收先到版本，本递交保留为草稿。`);
        }
        // 同一签署人重复递交。
        if (review.signatures.some((s) => s.reviewerId === reviewerId)) {
          return keepDraft('该签署人已签署，不能重复新增签署；草稿已保留，可在失效清除后重新确认。');
        }

        const write: ReviewWrite = {
          requestNo,
          documentId,
          type: 'sign',
          status: 'pending',
          steps: [
            { id: 'validate', label: '校验快照版本与并发冲突', done: false },
            { id: 'sign', label: '写入双人签署', done: false },
            { id: 'finalize', label: '更新复核轮次与发布门禁', done: false }
          ],
          payload: { reviewerId, conclusions, snapshotVersion },
          createdAt: nowIso()
        };

        let currentReview: DocReview = { ...review };
        let currentWrite: ReviewWrite = { ...write };
        const persist = () => {
          set({
            reviews: { ...get().reviews, [documentId]: currentReview },
            writes: { ...get().writes, [requestNo]: currentWrite }
          });
        };

        // 步骤 1：校验（已通过上面的冲突检测）。
        currentWrite = {
          ...currentWrite,
          steps: currentWrite.steps.map((s) => (s.id === 'validate' ? { ...s, done: true } : s)),
          lastCompletedStep: 'validate'
        };

        // 步骤 2：写入签署（幂等：同一请求号只写一次）。
        const sig: Signature = {
          requestNo, reviewerId, reviewerName,
          signedAt: nowIso(), snapshotVersion, conclusions, conclusionsHash: chash, valid: true
        };
        if (!currentReview.signatures.some((s) => s.requestNo === requestNo)) {
          currentReview = { ...currentReview, signatures: [...currentReview.signatures, sig] };
        }
        currentWrite = {
          ...currentWrite,
          steps: currentWrite.steps.map((s) => (s.id === 'sign' ? { ...s, done: true } : s)),
          lastCompletedStep: 'sign'
        };

        if (simulateFailure) {
          // 模拟写入失败：签署已写入但门禁更新未提交，等待凭请求号恢复。
          currentWrite = {
            ...currentWrite,
            status: 'failed',
            lastCompletedStep: 'sign',
            resultSummary: '写入失败：签署已落账，但发布门禁更新未提交'
          };
          persist();
          return { ok: false, error: '写入失败（模拟）：已凭请求号保留签署，可从最后完整复核项继续' };
        }

        // 步骤 3：提交门禁。
        currentWrite = {
          ...currentWrite,
          steps: currentWrite.steps.map((s) => (s.id === 'finalize' ? { ...s, done: true } : s)),
          lastCompletedStep: 'finalize',
          status: 'committed',
          committedAt: nowIso(),
          resultSummary: `已接收 ${reviewerName} 签署（${requestNo}）`
        };
        persist();
        return { ok: true };
      },

      // 写入失败恢复：凭原请求号从最后一个完整复核项继续，沿用第一次结果。
      retryWrite: (requestNo) => {
        const state = get();
        const write = state.writes[requestNo];
        if (!write) return { ok: false, error: '请求号不存在' };
        if (write.status === 'committed') {
          set({ writes: { ...get().writes, [requestNo]: { ...write, reused: true } } });
          return { ok: true, reused: true };
        }
        const review = state.reviews[write.documentId];
        if (!review || !review.snapshot || !write.payload) return { ok: false, error: '快照缺失，无法恢复' };

        let currentReview: DocReview = { ...review };
        let currentWrite: ReviewWrite = { ...write, status: 'pending' as const };
        const persist = () => {
          set({
            reviews: { ...get().reviews, [write.documentId]: currentReview },
            writes: { ...get().writes, [requestNo]: currentWrite }
          });
        };

        for (const step of currentWrite.steps) {
          if (step.done) continue;
          if (step.id === 'sign') {
            // 幂等重建签署：同一请求号不新增第二套。
            const { reviewerId, conclusions, snapshotVersion } = write.payload;
            const reviewerName = REVIEWERS.find((r) => r.id === reviewerId)?.name ?? reviewerId;
            if (!currentReview.signatures.some((s) => s.requestNo === requestNo)) {
              currentReview = {
                ...currentReview,
                signatures: [...currentReview.signatures, {
                  requestNo, reviewerId, reviewerName,
                  signedAt: nowIso(), snapshotVersion,
                  conclusions, conclusionsHash: conclusionsHash(conclusions), valid: true
                }]
              };
            }
          }
          step.done = true;
          currentWrite = { ...currentWrite, lastCompletedStep: step.id };
          // 若故障仍在注入，在最后一步前再次失败。
          if (get().faultInjection && step.id === 'finalize') {
            currentWrite = { ...currentWrite, status: 'failed', resultSummary: '写入仍失败（模拟）：发布门禁更新未提交' };
            persist();
            return { ok: false, error: '写入仍失败（模拟），已从最后完整复核项继续' };
          }
        }

        currentWrite = {
          ...currentWrite,
          status: 'committed',
          committedAt: nowIso(),
          reused: true,
          resultSummary: `已凭原请求号 ${requestNo} 恢复，沿用第一次结果`
        };
        persist();
        return { ok: true, reused: true };
      },

      // 对账：初审后只要页序、元数据或任一区域版本变化，两份签署一起失效并列出受影响对象。
      reconcile: (documentId) => {
        const doc = useDisclosureStore.getState().documents.find((d) => d.id === documentId);
        const review = get().reviews[documentId];
        if (!doc || !review || !review.snapshot) return;
        const snap = review.snapshot;
        const cur = computeFingerprint(doc);
        const now = nowIso();

        const open = review.invalidations.filter((i) => !i.resolved);
        const next: Invalidation[] = [...open];
        const push = (inv: Omit<Invalidation, 'detectedAt' | 'resolved'>) => {
          if (!next.some((i) => i.kind === inv.kind && i.targetId === inv.targetId)) {
            next.push({ ...inv, detectedAt: now, resolved: false });
          }
        };

        // 页序变化。
        const snapPageHash = hashString(JSON.stringify({ pages: snap.pageCount, pageOrder: snap.pageOrder }));
        const curPageHash = hashString(JSON.stringify({ pages: doc.pages, pageOrder: cur.pageOrder }));
        if (snapPageHash !== curPageHash) {
          push({ id: `INV-${Date.now()}-po`, kind: 'page-order', targetId: 'page-order', label: '页序', reason: '页序 / 页数与冻结快照不一致' });
        }
        // 元数据变化。
        const snapMetaHash = hashString(JSON.stringify({ classification: snap.classification, owner: snap.owner, title: snap.title, bundle: snap.bundle }));
        const curMetaHash = hashString(JSON.stringify({ classification: doc.classification, owner: doc.owner, title: doc.title, bundle: doc.bundle }));
        if (snapMetaHash !== curMetaHash) {
          push({ id: `INV-${Date.now()}-meta`, kind: 'metadata', targetId: 'metadata', label: '元数据', reason: '密级 / 责任人员 / 案卷信息与冻结快照不一致' });
        }
        // 区域版本变化、新增或删除。
        for (const r of snap.regions) {
          const current = doc.redactions.find((x) => x.id === r.id);
          if (!current) {
            push({ id: `INV-${Date.now()}-${r.id}`, kind: 'region', targetId: r.id, label: `区域 ${r.id}`, reason: '该去密区域已被删除' });
          } else {
            const curVer = (current as Redaction & { version?: number }).version ?? 1;
            const snapVer = snap.regionVersions[r.id] ?? 1;
            if (curVer !== snapVer) {
              push({ id: `INV-${Date.now()}-${r.id}`, kind: 'region', targetId: r.id, label: `区域 ${r.id}`, reason: `区域版本 v${snapVer} → v${curVer}，去密结论需重核` });
            }
          }
        }
        for (const r of doc.redactions) {
          if (!snap.regions.some((x) => x.id === r.id)) {
            push({ id: `INV-${Date.now()}-${r.id}`, kind: 'region', targetId: r.id, label: `区域 ${r.id}`, reason: '新增去密区域，未纳入冻结快照' });
          }
        }

        // 内容已回到冻结状态的失效项自动结清。
        const resolved = next.filter((i) => {
          if (i.kind === 'page-order') return snapPageHash === curPageHash;
          if (i.kind === 'metadata') return snapMetaHash === curMetaHash;
          const current = doc.redactions.find((x) => x.id === i.targetId);
          if (!current) return false;
          const curVer = (current as Redaction & { version?: number }).version ?? 1;
          const snapVer = snap.regionVersions[i.targetId] ?? 1;
          return curVer === snapVer;
        }).map((i) => ({ ...i, resolved: true }));
        const unresolved = next.filter((i) => !resolved.some((r) => r.id === i.id));
        const invalidations = [...resolved, ...unresolved];
        const hasOpen = invalidations.some((i) => !i.resolved);

        let signatures = review.signatures;
        let signatureHistory = review.signatureHistory;
        if (hasOpen && review.signatures.length > 0) {
          // 两份签署一起失效，进入历史台账，处理期间发布包锁定。
          signatureHistory = [...review.signatures.map((s) => ({ ...s, valid: false })), ...review.signatureHistory];
          signatures = [];
        }

        set({
          reviews: {
            ...get().reviews,
            [documentId]: {
              ...review,
              signatures,
              signatureHistory,
              invalidations,
              releaseBlocked: hasOpen
            }
          }
        });
      },

      // 结清单个失效项。
      resolveInvalidation: (documentId, invalidationId) => {
        const review = get().reviews[documentId];
        if (!review) return;
        const invalidations = review.invalidations.map((i) => (i.id === invalidationId ? { ...i, resolved: true } : i));
        const releaseBlocked = invalidations.some((i) => !i.resolved);
        set({
          reviews: {
            ...get().reviews,
            [documentId]: { ...review, invalidations, releaseBlocked }
          }
        });
      },

      // 失效项清完后重新冻结快照，进入新一轮复核，两人重新确认。
      refreeze: (documentId, operator) => {
        const doc = useDisclosureStore.getState().documents.find((d) => d.id === documentId);
        const review = get().reviews[documentId];
        if (!doc || !review) return;
        const version = (review.snapshot?.snapshotVersion ?? 0) + 1;
        const snapshot = buildSnapshot(doc, version, operator);
        set({
          reviews: {
            ...get().reviews,
            [documentId]: {
              ...review,
              schemaVersion: REVIEW_SCHEMA_VERSION,
              round: review.round + 1,
              snapshot,
              signatures: [],
              signatureHistory: [...review.signatures.map((s) => ({ ...s, valid: false })), ...review.signatureHistory],
              invalidations: review.invalidations.map((i) => ({ ...i, resolved: true })),
              releaseBlocked: false,
              conflictDraft: null
            }
          }
        });
      },

      clearConflictDraft: (documentId) => {
        const review = get().reviews[documentId];
        if (!review) return;
        set({ reviews: { ...get().reviews, [documentId]: { ...review, conflictDraft: null } } });
      },

      setFaultInjection: (value) => set({ faultInjection: value })
    }),
    { name: 'yy59-review-ledger' }
  )
);

export { emptyConclusions, nowIso };
