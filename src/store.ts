import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  computeSnapshot,
  conclusionDiffs,
  diffSnapshots,
  newRequestId,
  normalizeLegacyDoc,
  payloadFromSnapshot,
  timestamp,
  type AuditEvent,
  type FrozenSnapshot,
  type ReleasePackage,
  type RequestRecord,
  type ReviewDraft,
  type ReviewSession,
  type SignaturePayload
} from './review';

export type Redaction = {
  id: string;
  page: number;
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  privilege: string;
  status: 'draft' | 'confirmed';
};

export type DisclosureRecord = {
  id: string;
  title: string;
  bundle: string;
  pages: number;
  pageOrder: number[];
  pageOrderVersion: number;
  metadataVersion: number;
  classification: '内部' | '机密' | '严格机密';
  owner: string;
  updatedAt: string;
  status: '去密中' | '待质检' | '可发布';
  issue: string;
  size: string;
  redactions: Redaction[];
};

const defaultDocuments: DisclosureRecord[] = [
  {
    id: 'DOC-00418',
    title: '设备采购补充协议（第三版）',
    bundle: '北岭项目 · 第一批披露',
    pages: 3,
    pageOrder: [1, 2, 3],
    pageOrderVersion: 1,
    metadataVersion: 2,
    classification: '严格机密',
    owner: '林清',
    updatedAt: '09:48',
    status: '去密中',
    issue: '合同主体与商业条款',
    size: '8.4 MB',
    redactions: [
      { id: 'R-01', page: 1, version: 2, x: 0.12, y: 0.16, width: 0.30, height: 0.04, reason: '商业秘密', privilege: '合同保密', status: 'confirmed' },
      { id: 'R-02', page: 1, version: 1, x: 0.50, y: 0.43, width: 0.34, height: 0.06, reason: '个人手机号', privilege: '个人信息', status: 'draft' },
      { id: 'R-03', page: 2, version: 3, x: 0.11, y: 0.25, width: 0.68, height: 0.05, reason: '第三方报价', privilege: '商业敏感', status: 'confirmed' }
    ]
  },
  {
    id: 'DOC-00427',
    title: '现场会议纪要 2026-08-19',
    bundle: '北岭项目 · 第一批披露',
    pages: 3,
    pageOrder: [1, 2, 3],
    pageOrderVersion: 1,
    metadataVersion: 1,
    classification: '机密',
    owner: '周叙',
    updatedAt: '09:31',
    status: '待质检',
    issue: '事故预防与整改安排',
    size: '3.1 MB',
    redactions: [
      { id: 'R-04', page: 1, version: 1, x: 0.08, y: 0.69, width: 0.74, height: 0.05, reason: '内部调查意见', privilege: '工作成果', status: 'confirmed' }
    ]
  },
  {
    id: 'DOC-00435',
    title: '设备运行数据摘录',
    bundle: '北岭项目 · 第二批披露',
    pages: 3,
    pageOrder: [1, 2, 3],
    pageOrderVersion: 1,
    metadataVersion: 1,
    classification: '内部',
    owner: '顾言',
    updatedAt: '08:56',
    status: '可发布',
    issue: '运行记录',
    size: '12.7 MB',
    redactions: [
      { id: 'R-05', page: 2, version: 1, x: 0.44, y: 0.56, width: 0.26, height: 0.04, reason: '人员姓名', privilege: '个人信息', status: 'confirmed' }
    ]
  }
];

export const REVIEW_CHECK_ITEMS = [
  { id: 'forbidden-terms', label: '全文禁词与姓名复核', detail: '扫描原始页和发布页文本层' },
  { id: 'page-number', label: '页序与页码连续性', detail: '检查拆页、合并及漏页情况' },
  { id: 'image-boundary', label: '图像边界残片', detail: '逐页比较遮蔽边界 2mm 区域' },
  { id: 'metadata', label: '文档元数据清理', detail: '作者、修订人、批注和隐藏字段' }
];

export type SubmitOutcome =
  | { ok: true; signatureId: string; requestId: string; resumed: boolean; message: string }
  | { ok: false; requestId: string; stage: 'drift' | 'write-failed' | 'conflict' | 'blocked'; message: string; againstRequestId?: string; completedItems?: number; totalItems?: number };

const REVIEWERS = ['林清', '周叙'];

function emptyDraft(frozen: FrozenSnapshot): ReviewDraft {
  return {
    checks: Object.fromEntries(REVIEW_CHECK_ITEMS.map((item) => [item.id, true])),
    metadataCleaned: true,
    pageOrderChoice: '一致',
    metadataChoice: '已清理',
    regionChoices: Object.fromEntries(frozen.regions.map((region) => [region.id, '一致' as const]))
  };
}

function countItems(frozen: FrozenSnapshot, draft: ReviewDraft): number {
  return frozen.pages.length + frozen.regions.length + REVIEW_CHECK_ITEMS.length + 1;
}

function findSession(sessions: ReviewSession[], documentId: string): ReviewSession | undefined {
  return sessions.find((session) => session.documentId === documentId);
}

function appendAudit(session: ReviewSession, text: string, tone: AuditEvent['tone'] = 'info'): ReviewSession {
  const event: AuditEvent = { at: timestamp(), text, tone };
  return { ...session, audit: [event, ...session.audit].slice(0, 40) };
}

// 任一签名生效后，页序 / 元数据 / 区域版本漂移：两份签署一起失效，并逐项登记受影响对象。
// 初签前漂移只标记基线过期（不产生阻断项），刷新冻结后即可继续。
function reconcileSession(session: ReviewSession, live: DisclosureRecord, now = timestamp()): ReviewSession {
  const liveSnapshot = computeSnapshot(live, now);
  const fresh = diffSnapshots(session.frozen, liveSnapshot, now);
  const hadSignatures = session.signatures.length > 0;
  const hadActiveSignatures = session.signatures.some((signature) => signature.active);

  if (fresh.length === 0) {
    return session.status === 'active' && !session.baselineStale ? session : { ...session, baselineStale: false };
  }

  const existing = new Set(session.invalidations.filter((item) => !item.resolved).map((item) => item.id));
  const added = fresh.filter((item) => !existing.has(item.id));

  // 初签前：只提示基线过期，不登记失效项、不阻断，刷新冻结即可。
  if (!hadSignatures) {
    if (added.length === 0) return session;
    return appendAudit(
      { ...session, baselineStale: true },
      `初签前基线发生变化（${added.map((item) => item.label).join('、')}），请刷新冻结后再递交`,
      'warn'
    );
  }

  if (added.length === 0) return session;

  let next: ReviewSession = {
    ...session,
    invalidations: [...added, ...session.invalidations],
    status: 'invalidated',
    baselineStale: false
  };
  if (hadActiveSignatures) {
    next = {
      ...next,
      signatures: next.signatures.map((signature) =>
        signature.active
          ? { ...signature, active: false, invalidatedReason: `冻结基线漂移（${added.map((item) => item.label).join('、')}）` }
          : signature
      )
    };
    const names = session.signatures.filter((signature) => signature.active).map((signature) => signature.reviewer).join('、');
    next = appendAudit(
      next,
      `${names}的两份签署因页序/元数据/区域版本变化同时失效，受影响对象 ${added.length} 项，处理期间发布包暂停生成`,
      'warn'
    );
  } else {
    next = appendAudit(next, `处理期间基线再次变化，新增受影响对象 ${added.length} 项（${added.map((item) => item.label).join('、')}）`, 'warn');
  }
  return next;
}

function reconcileAll(sessions: ReviewSession[], documents: DisclosureRecord[]): ReviewSession[] {
  return sessions.map((session) => {
    const live = documents.find((doc) => doc.id === session.documentId);
    if (!live) return session;
    const reconciled = reconcileSession(session, live);
    // 封印后再漂移：签署失效，文档退回待质检，不能再作为可发布对象进包。
    if (session.status === 'sealed' && reconciled.status === 'invalidated') {
      return appendAudit(reconciled, '文档已从可发布批次候选中撤回（状态退回待质检）', 'warn');
    }
    return reconciled;
  });
}

type AppliedSignature = {
  id: string;
  reviewer: string;
  requestId: string;
  payload: SignaturePayload;
  round: number;
  resumed: boolean;
  total: number;
  completed?: number;
};

// 在会话上落一份签署：只统计当前轮的生效签署；两轮各保留自己的签署记录用于追溯。
function appendSignature(session: ReviewSession, applied: AppliedSignature): ReviewSession {
  const signature = {
    id: applied.id,
    reviewer: applied.reviewer,
    signedAt: timestamp(),
    requestId: applied.requestId,
    reSign: applied.round > 1,
    round: applied.round,
    active: true as const,
    payload: applied.payload
  };
  const signatures = [...session.signatures, signature];
  const activeCount = signatures.filter((item) => item.active && item.round === session.round).length;
  const next: ReviewSession = {
    ...session,
    signatures,
    conflictNotice: undefined,
    status: activeCount === 2 ? 'reconfirming' : session.status === 'sealed' ? 'sealed' : session.status === 'reconfirming' ? 'reconfirming' : 'active'
  };
  return appendAudit(
    next,
    applied.resumed && applied.completed !== undefined
      ? `请求 ${applied.requestId} 断点续传成功（${applied.completed}/${applied.total} → ${applied.total}/${applied.total}），第 ${applied.round} 轮签署 ${applied.id} 落库，未新增第二套签署`
      : `接收 ${applied.reviewer} 第 ${applied.round} 轮签署 ${applied.id}（请求 ${applied.requestId}，复核项 ${applied.total} 个）`,
    'ok'
  );
}

type State = {
  documents: DisclosureRecord[];
  activeDocumentId: string;
  activePage: number;
  activeRedactionId: string | null;
  redactionMode: boolean;
  qualityDocumentId: string;
  activeReviewer: string;
  sessions: ReviewSession[];
  reviewDrafts: Record<string, Record<string, ReviewDraft>>;
  requests: RequestRecord[];
  releasePackages: ReleasePackage[];
  simulateWriteFailure: boolean;
  lastSubmit: SubmitOutcome | null;
  selectDocument: (id: string) => void;
  setPage: (page: number) => void;
  toggleRedactionMode: () => void;
  addRedaction: (redaction: Omit<Redaction, 'id' | 'status' | 'version'>) => void;
  confirmRedaction: (id: string) => void;
  selectRedaction: (id: string) => void;
  updateClassification: (classification: DisclosureRecord['classification']) => void;
  selectQualityDocument: (id: string) => void;
  setActiveReviewer: (reviewer: string) => void;
  startReview: (documentId: string) => void;
  updateDraft: (documentId: string, reviewer: string, patch: Partial<ReviewDraft>) => void;
  setRegionChoice: (documentId: string, reviewer: string, regionId: string, choice: '一致' | '有异议') => void;
  submitSignature: (documentId: string, reviewer: string, requestId?: string) => SubmitOutcome;
  submitSimultaneous: (documentId: string) => { winner: SubmitOutcome; loser: SubmitOutcome };
  resolveInvalidation: (documentId: string, invalidationId: string) => void;
  refreshFreeze: (documentId: string) => void;
  sealDocument: (documentId: string) => { ok: boolean; message: string };
  generateReleasePackage: (documentIds: string[], batchName: string) => { ok: boolean; message?: string; pkg?: ReleasePackage };
  simulateDrift: (documentId: string, kind: 'page-order' | 'metadata' | 'region') => void;
  toggleFailureSimulation: () => void;
  clearLastSubmit: () => void;
};

export const useDisclosureStore = create<State>()(
  persist(
    (set, get) => {
      const mutateDocuments = (updater: (documents: DisclosureRecord[]) => DisclosureRecord[]) => {
        set((state) => {
          const documents = updater(state.documents);
          const sessions = reconcileAll(state.sessions, documents);
          // 封印后漂移导致失效：同步把文档状态退回“待质检”。
          const withdrawnIds = new Set(
            state.sessions
              .filter((before, index) => before.status === 'sealed' && sessions[index].status === 'invalidated')
              .map((session) => session.documentId)
          );
          const nextDocuments =
            withdrawnIds.size > 0
              ? documents.map((doc) => (withdrawnIds.has(doc.id) && doc.status === '可发布' ? { ...doc, status: '待质检' as const } : doc))
              : documents;
          return { documents: nextDocuments, sessions };
        });
      };

      const mutateDocument = (documentId: string, updater: (doc: DisclosureRecord) => DisclosureRecord) => {
        mutateDocuments((documents) => documents.map((doc) => (doc.id === documentId ? updater(doc) : doc)));
      };

      return {
        documents: defaultDocuments,
        activeDocumentId: defaultDocuments[0].id,
        activePage: 1,
        activeRedactionId: 'R-02',
        redactionMode: false,
        qualityDocumentId: defaultDocuments[1].id,
        activeReviewer: REVIEWERS[0],
        sessions: [],
        reviewDrafts: {},
        requests: [],
        releasePackages: [],
        simulateWriteFailure: false,
        lastSubmit: null,

        selectDocument: (id) => set({ activeDocumentId: id, activePage: 1, activeRedactionId: null, redactionMode: false }),
        setPage: (page) => set({ activePage: page }),
        toggleRedactionMode: () => set((state) => ({ redactionMode: !state.redactionMode })),

        addRedaction: (redaction) =>
          mutateDocument(get().activeDocumentId, (doc) => ({
            ...doc,
            updatedAt: timestamp(),
            redactions: [
              ...doc.redactions,
              { ...redaction, id: `R-${Date.now().toString(36)}`, version: 1, status: 'draft' as const }
            ]
          })),

        // 区域确认本身也是一次区域版本变化（状态进入冻结基线）。
        confirmRedaction: (id) =>
          mutateDocuments((documents) =>
            documents.map((doc) => ({
              ...doc,
              redactions: doc.redactions.map((item) =>
                item.id === id ? { ...item, status: 'confirmed' as const, version: item.version + 1 } : item
              )
            }))
          ),

        selectRedaction: (id) => set({ activeRedactionId: id }),

        updateClassification: (classification) =>
          mutateDocument(get().activeDocumentId, (doc) => ({
            ...doc,
            classification,
            metadataVersion: doc.metadataVersion + 1,
            updatedAt: timestamp()
          })),

        selectQualityDocument: (id) => set({ qualityDocumentId: id, lastSubmit: null }),
        setActiveReviewer: (reviewer) => set({ activeReviewer: reviewer, lastSubmit: null }),
        // 演练三类漂移：交换页序 / 改写元数据 / 区域补改，均会触发双双失效对账。
        simulateDrift: (documentId, kind) =>
          mutateDocument(documentId, (doc) => {
            if (kind === 'page-order') {
              const order = [...doc.pageOrder];
              [order[0], order[1]] = [order[1], order[0]];
              return { ...doc, pageOrder: order, pageOrderVersion: doc.pageOrderVersion + 1, updatedAt: timestamp() };
            }
            if (kind === 'metadata') {
              return { ...doc, metadataVersion: doc.metadataVersion + 1, updatedAt: timestamp() };
            }
            return {
              ...doc,
              redactions: doc.redactions.map((region, index) =>
                index === 0 ? { ...region, version: region.version + 1, status: 'confirmed' as const } : region
              ),
              updatedAt: timestamp()
            };
          }),

        toggleFailureSimulation: () => set((state) => ({ simulateWriteFailure: !state.simulateWriteFailure })),
        clearLastSubmit: () => set({ lastSubmit: null }),

        // 发起双人复核：冻结原始页、发布页、去密区域与两人各自的复核结论草稿。
        startReview: (documentId) =>
          set((state) => {
            const doc = state.documents.find((item) => item.id === documentId);
            if (!doc) return state;
            const now = timestamp();
            const frozen = computeSnapshot(doc, now);
            const existing = findSession(state.sessions, documentId);
            const session: ReviewSession = existing
              ? appendAudit(
                  { ...existing, round: 1, frozen, status: 'active', baselineStale: false, invalidations: [], signatures: [], conflictNotice: undefined },
                  `重新发起双人复核并冻结（原始页 ${frozen.pages.length}、发布页 ${frozen.pages.length}、区域 ${frozen.regions.length}）`,
                  'info'
                )
              : {
                  documentId,
                  initiatedAt: now,
                  round: 1,
                  frozen,
                  status: 'active',
                  baselineStale: false,
                  signatures: [],
                  invalidations: [],
                  audit: [
                    {
                      at: now,
                      text: `发起双人复核：冻结原始页 ${frozen.pages.length} 页、发布页 ${frozen.pages.length} 页、去密区域 ${frozen.regions.length} 个与复核结论`,
                      tone: 'info'
                    }
                  ]
                };
            const drafts = {
              ...state.reviewDrafts,
              [documentId]: Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, emptyDraft(frozen)]))
            };
            return {
              sessions: [...state.sessions.filter((item) => item.documentId !== documentId), session],
              reviewDrafts: drafts
            };
          }),

        updateDraft: (documentId, reviewer, patch) =>
          set((state) => {
            const docDrafts = state.reviewDrafts[documentId] ?? {};
            const current = docDrafts[reviewer];
            if (!current) return state;
            return {
              reviewDrafts: {
                ...state.reviewDrafts,
                [documentId]: { ...docDrafts, [reviewer]: { ...current, ...patch } }
              }
            };
          }),

        setRegionChoice: (documentId, reviewer, regionId, choice) =>
          set((state) => {
            const docDrafts = state.reviewDrafts[documentId] ?? {};
            const current = docDrafts[reviewer];
            if (!current) return state;
            return {
              reviewDrafts: {
                ...state.reviewDrafts,
                [documentId]: {
                  ...docDrafts,
                  [reviewer]: { ...current, regionChoices: { ...current.regionChoices, [regionId]: choice } }
                }
              }
            };
          }),

        // 顺序递交：原请求号幂等恢复；写入失败按复核项断点续传，重复重试沿用第一次结果。
        submitSignature: (documentId, reviewer, providedRequestId) => {
          const state = get();
          const fail = (outcome: SubmitOutcome) => {
            set({ lastSubmit: outcome });
            return outcome;
          };
          const session = findSession(state.sessions, documentId);
          if (!session) return fail({ ok: false, requestId: providedRequestId ?? newRequestId(), stage: 'blocked', message: '尚未发起双人复核，无法签署' });
          const requestId = providedRequestId ?? newRequestId();
          const prior = state.requests.find((request) => request.requestId === requestId);

          // 重复重试沿用第一次结果，绝不新增第二套签署。
          if (prior?.state === 'succeeded' && prior.signatureId) {
            const existing = session.signatures.find((signature) => signature.id === prior.signatureId && signature.active);
            return fail(
              existing
                ? { ok: true, signatureId: prior.signatureId!, requestId, resumed: true, message: `原请求 ${requestId} 已有结果，沿用首次签署（幂等返回，不新增签署）` }
                : { ok: false, requestId, stage: 'drift', message: `原请求 ${requestId} 的签署已随基线漂移失效，请清零失效项后重新确认` }
            );
          }

          if (session.baselineStale) {
            return fail({ ok: false, requestId, stage: 'drift', message: '初签前基线已变化，请先刷新冻结快照再递交' });
          }
          if (session.invalidations.some((item) => !item.resolved) || session.status === 'invalidated') {
            return fail({
              ok: false,
              requestId,
              stage: 'drift',
              message: `存在 ${session.invalidations.filter((item) => !item.resolved).length} 项未清零的失效对象，处理期间不能签署，发布包亦不能生成`
            });
          }

          const draft = state.reviewDrafts[documentId]?.[reviewer];
          if (!draft) return fail({ ok: false, requestId, stage: 'blocked', message: '复核结论草稿缺失，请重新发起复核' });
          if (session.signatures.some((signature) => signature.reviewer === reviewer && signature.active && signature.round === session.round)) {
            return fail({ ok: false, requestId, stage: 'blocked', message: `${reviewer} 已在本轮冻结基线签署，请勿重复签署` });
          }

          const total = countItems(session.frozen, draft);
          const failedRecord = prior?.state === 'failed' ? prior : undefined;

          // 模拟写入失败：首次只写过前两个复核项即中断，原请求号恢复时从断点继续。
          if (state.simulateWriteFailure && !failedRecord) {
            const record: RequestRecord = {
              requestId, documentId, reviewer, createdAt: timestamp(),
              state: 'failed', completedItems: 2, totalItems: total,
              failReason: '写入失败：发布通道暂时不可用，签署未落库'
            };
            const outcome: SubmitOutcome = {
              ok: false, requestId, stage: 'write-failed', completedItems: 2, totalItems: total,
              message: `写入失败（已完成 2/${total} 个复核项）。请凭原请求号 ${requestId} 恢复，从最后一个完整复核项继续`
            };
            set((current) => ({ requests: [...current.requests, record], lastSubmit: outcome }));
            return outcome;
          }

          const payload = payloadFromSnapshot(session.frozen, draft);
          const signatureId = `SIG-${documentId}-${reviewer}-${Date.now().toString(36)}`;
          const record: RequestRecord = {
            requestId, documentId, reviewer, createdAt: timestamp(),
            state: 'succeeded', completedItems: total, totalItems: total, signatureId
          };
          const outcome: SubmitOutcome = {
            ok: true, signatureId, requestId, resumed: Boolean(failedRecord),
            message: failedRecord
              ? `凭原请求号 ${requestId} 恢复成功：从第 ${failedRecord.completedItems} 个完整复核项续传（${total}/${total}），未产生第二套签署`
              : session.round > 1
                ? `${reviewer} 已按第 ${session.round} 轮冻结基线重新确认签署`
                : `${reviewer} 签署完成（请求 ${requestId}，复核项 ${total} 个）`
          };

          set((current) => ({
            requests: [...current.requests.filter((item) => item.requestId !== requestId), record],
            lastSubmit: outcome,
            sessions: current.sessions.map((item) =>
              item.documentId === documentId
                ? appendSignature(item, { id: signatureId, reviewer, requestId, payload, round: item.round, resumed: Boolean(failedRecord), total, completed: failedRecord?.completedItems })
                : item
            )
          }));
          return outcome;
        },

        // 两名质控员同时递交同一文档（原子竞争）：只接收先到版本，后到者看到冲突并保留草稿。
        submitSimultaneous: (documentId) => {
          const state = get();
          const session = findSession(state.sessions, documentId);
          const blocked = (message: string) => {
            const outcome: SubmitOutcome = { ok: false, requestId: newRequestId(), stage: 'blocked', message };
            set({ lastSubmit: outcome });
            return { winner: outcome, loser: outcome };
          };
          if (!session) return blocked('尚未发起双人复核，无法同时递交');
          if (session.baselineStale) return blocked('初签前基线已变化，请先刷新冻结快照');
          if (session.invalidations.some((item) => !item.resolved)) return blocked('存在未清零失效对象，处理期间不能签署');
          if (session.signatures.some((signature) => signature.active && signature.round === session.round)) return blocked('本轮已有生效签署，无需同时递交');

          const [reviewerA, reviewerB] = REVIEWERS;
          // 以当前操作者作为先到方（真实系统按服务端接收时间裁决）。
          const winnerName = state.activeReviewer === reviewerB ? reviewerB : reviewerA;
          const loserName = winnerName === reviewerA ? reviewerB : reviewerA;
          const winnerDraft = state.reviewDrafts[documentId]?.[winnerName];
          if (!winnerDraft) return blocked('复核结论草稿缺失，请重新发起复核');

          const winnerRequestId = newRequestId();
          const loserRequestId = newRequestId();
          const total = countItems(session.frozen, winnerDraft);
          const payload = payloadFromSnapshot(session.frozen, winnerDraft);
          const signatureId = `SIG-${documentId}-${winnerName}-${Date.now().toString(36)}`;
          const winnerRecord: RequestRecord = {
            requestId: winnerRequestId, documentId, reviewer: winnerName, createdAt: timestamp(),
            state: 'succeeded', completedItems: total, totalItems: total, signatureId
          };
          const winner: SubmitOutcome = {
            ok: true, signatureId, requestId: winnerRequestId, resumed: false,
            message: `同时递交裁决：${winnerName} 的请求 ${winnerRequestId} 先到并被接收`
          };
          const loser: SubmitOutcome = {
            ok: false, requestId: loserRequestId, stage: 'conflict', againstRequestId: winnerRequestId,
            message: `并发冲突：${winnerName} 的请求 ${winnerRequestId} 先到并已接收，${loserName} 的版本保留为草稿，请刷新后再递交`
          };

          set((current) => ({
            requests: [...current.requests, winnerRecord],
            lastSubmit: loser,
            sessions: current.sessions.map((item) => {
              if (item.documentId !== documentId) return item;
              let next = appendSignature(item, { id: signatureId, reviewer: winnerName, requestId: winnerRequestId, payload, round: item.round, resumed: false, total });
              next = { ...next, conflictNotice: { reviewer: loserName, requestId: loserRequestId, againstRequestId: winnerRequestId, at: timestamp() } };
              next = appendAudit(next, `两人同时递交：接收先到请求 ${winnerRequestId}（${winnerName}），后到请求 ${loserRequestId}（${loserName}）冲突，草稿保留`, 'warn');
              return next;
            })
          }));
          return { winner, loser };
        },

        // 失效项逐项处理：清零后刷新冻结，两人重新确认，页序/元数据/区域结论一致才能封印。
        resolveInvalidation: (documentId, invalidationId) =>
          set((state) => {
            const session = findSession(state.sessions, documentId);
            if (!session) return state;
            const invalidations = session.invalidations.map((item) =>
              item.id === invalidationId ? { ...item, resolved: true } : item
            );
            const remaining = invalidations.filter((item) => !item.resolved).length;
            let next: ReviewSession = { ...session, invalidations };
            if (remaining === 0) {
              const doc = state.documents.find((item) => item.id === documentId);
              const frozen = doc ? computeSnapshot(doc, timestamp()) : session.frozen;
              const nextRound = session.round + 1;
              next = {
                ...next,
                round: nextRound,
                frozen: { ...frozen, frozenAt: session.frozen.frozenAt, refrozenAt: timestamp() },
                status: 'reconfirming',
                baselineStale: false
              };
              const docDrafts = state.reviewDrafts[documentId] ?? {};
              const migratedDrafts = Object.fromEntries(
                Object.entries(docDrafts).map(([reviewer, draft]) => [
                  reviewer,
                  {
                    ...draft,
                    regionChoices: {
                      ...Object.fromEntries(frozen.regions.map((region) => [region.id, '一致' as const])),
                      ...draft.regionChoices
                    }
                  }
                ])
              );
              next = appendAudit(next, `失效项已全部清零，冻结基线已刷新，进入第 ${nextRound} 轮，等待两人按新基线重新确认`, 'ok');
              return {
                sessions: state.sessions.map((item) => (item.documentId === documentId ? next : item)),
                reviewDrafts: { ...state.reviewDrafts, [documentId]: migratedDrafts }
              };
            }
            next = appendAudit(next, `已处理失效项 ${invalidationId}，剩余 ${remaining} 项`, 'info');
            return { sessions: state.sessions.map((item) => (item.documentId === documentId ? next : item)) };
          }),

        refreshFreeze: (documentId) =>
          set((state) => {
            const session = findSession(state.sessions, documentId);
            const doc = state.documents.find((item) => item.id === documentId);
            if (!session || !doc) return state;
            const frozen = computeSnapshot(doc, timestamp());
            const hadSignatures = session.signatures.length > 0;
            const next = appendAudit(
              {
                ...session,
                round: hadSignatures ? session.round + 1 : session.round,
                frozen: { ...frozen, frozenAt: session.frozen.frozenAt, refrozenAt: timestamp() },
                baselineStale: false,
                invalidations: session.invalidations.map((item) => ({ ...item, resolved: true })),
                status: hadSignatures ? 'reconfirming' : 'active'
              },
              hadSignatures
                ? `手动刷新冻结基线（原始页/发布页/去密区域/复核结论重新快照），进入第 ${session.round + 1} 轮，等待两人重新确认`
                : '手动刷新冻结基线（原始页/发布页/去密区域/复核结论重新快照）',
              'info'
            );
            return { sessions: state.sessions.map((item) => (item.documentId === documentId ? next : item)) };
          }),

        sealDocument: (documentId) => {
          const state = get();
          const session = findSession(state.sessions, documentId);
          if (!session) return { ok: false, message: '尚未发起双人复核' };
          const unresolved = session.invalidations.filter((item) => !item.resolved).length;
          if (unresolved > 0) return { ok: false, message: `仍有 ${unresolved} 项失效对象未清零` };
          const activeSignatures = session.signatures.filter((signature) => signature.active && signature.round === session.round);
          if (activeSignatures.length !== 2) {
            return { ok: false, message: `需要两名质控员在第 ${session.round} 轮重新签署（当前 ${activeSignatures.length}/2）` };
          }
          const [first, second] = activeSignatures;
          const diffs = conclusionDiffs(first.payload, second.payload);
          if (
            first.payload.pageOrderVersion !== second.payload.pageOrderVersion ||
            first.payload.metadataVersion !== second.payload.metadataVersion ||
            first.payload.regionSetVersion !== second.payload.regionSetVersion
          ) {
            return { ok: false, message: '两人签署基于不同冻结版本，请刷新基线后重新确认' };
          }
          if (diffs.length > 0) {
            return { ok: false, message: `页序/元数据/区域结论不一致：${diffs.map((diff) => diff.label).join('、')}` };
          }
          const sealedAt = timestamp();
          set((current) => ({
            documents: current.documents.map((doc) => (doc.id === documentId ? { ...doc, status: '可发布' as const } : doc)),
            sessions: current.sessions.map((item) =>
              item.documentId === documentId
                ? appendAudit({ ...item, status: 'sealed', sealedAt }, '页序、元数据与各区域结论三一致，复核封印，可进入发布批次', 'ok')
                : item
            )
          }));
          return { ok: true, message: '复核封印完成，文档进入可发布状态' };
        },

        // 处理期间（有未清零失效项）发布包不能生成；只有封印文档才能入包，包内含完整追溯链。
        generateReleasePackage: (documentIds, batchName) => {
          const state = get();
          const blocked = documentIds
            .map((id) => {
              const session = findSession(state.sessions, id);
              if (!session) return { id, reason: '尚未完成双人复核' };
              const unresolved = session.invalidations.filter((item) => !item.resolved).length;
              if (unresolved > 0) return { id, reason: `${unresolved} 项失效对象处理中，发布包冻结` };
              if (session.status !== 'sealed') return { id, reason: '双人复核未封印' };
              return null;
            })
            .filter((item): item is { id: string; reason: string } => item !== null);
          if (blocked.length > 0) {
            return { ok: false, message: `发布包不能生成：${blocked.map((item) => `${item.id}（${item.reason}）`).join('；')}` };
          }
          const pkg: ReleasePackage = {
            id: `PKG-${Date.now().toString(36).toUpperCase()}`,
            batchName,
            createdAt: timestamp(),
            documentIds,
            traces: documentIds.map((id) => {
              const session = findSession(state.sessions, id)!;
              return {
                documentId: id,
                frozenAt: session.frozen.frozenAt,
                sealedAt: session.sealedAt ?? timestamp(),
                signatures: session.signatures
                  .filter((signature) => signature.active && signature.round === session.round)
                  .map((signature) => ({ reviewer: signature.reviewer, requestId: signature.requestId, signedAt: signature.signedAt }))
              };
            })
          };
          set((current) => ({ releasePackages: [pkg, ...current.releasePackages] }));
          return { ok: true, pkg };
        }
      };
    },
    {
      name: 'yy59-disclosure-draft',
      version: 2,
      // 旧草稿没有快照版本：兼容升级，补齐页序、元数据、区域版本基线。
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2 && Array.isArray(state.documents)) {
          state.documents = (state.documents as Array<Record<string, unknown>>).map((doc) => normalizeLegacyDoc(doc));
        }
        return state as State;
      },
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<State>;
        if (Array.isArray(persistedState.documents)) {
          persistedState.documents = (persistedState.documents as unknown as Array<Record<string, unknown>>).map((doc) =>
            normalizeLegacyDoc(doc)
          ) as unknown as DisclosureRecord[];
        }
        return { ...current, ...persistedState };
      },
      partialize: (state) => ({
        documents: state.documents,
        sessions: state.sessions,
        reviewDrafts: state.reviewDrafts,
        requests: state.requests,
        releasePackages: state.releasePackages
      })
    }
  )
);
