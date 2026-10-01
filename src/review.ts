// 双人复核可追溯发布批次的领域模型与纯函数：
// 发起即冻结（原始页 / 发布页 / 去密区域 / 复核结论），
// 页序、元数据、任一区域版本漂移即双双失效并登记受影响对象，
// 清零后两人按同一冻结基线重新确认，三一致（页序、元数据、各区域结论）才可封印进批次。

export type PageFingerprint = {
  page: number;
  originalHash: string;
  releaseHash: string;
};

export type RegionFingerprint = {
  id: string;
  page: number;
  version: number;
  geometry: string;
  reason: string;
  privilege: string;
  status: 'draft' | 'confirmed';
};

export type ChoiceOf<T extends string> = T;

export type ReviewDraft = {
  checks: Record<string, boolean>;
  metadataCleaned: boolean;
  pageOrderChoice: '一致' | '异常';
  metadataChoice: '已清理' | '有残留';
  regionChoices: Record<string, '一致' | '有异议'>;
};

export type SignaturePayload = {
  pageOrderVersion: number;
  metadataVersion: number;
  regionSetVersion: number;
  pageOrderChoice: string;
  metadataChoice: string;
  regionChoices: Record<string, string>;
  regionVersions: Record<string, number>;
  checks: Record<string, boolean>;
};

export type FrozenSnapshot = {
  frozenAt: string;
  refrozenAt?: string;
  pageOrderVersion: number;
  metadataVersion: number;
  regionSetVersion: number;
  pages: PageFingerprint[];
  regions: RegionFingerprint[];
};

export type InvalidationKind = 'page-order' | 'metadata' | 'region';

export type InvalidationItem = {
  id: string;
  kind: InvalidationKind;
  objectId: string;
  label: string;
  detail: string;
  detectedAt: string;
  resolved: boolean;
};

export type AuditEvent = {
  at: string;
  text: string;
  tone: 'info' | 'warn' | 'ok';
};

export type ReviewSignature = {
  id: string;
  reviewer: string;
  signedAt: string;
  requestId: string;
  reSign: boolean;
  round: number;
  active: boolean;
  invalidatedReason?: string;
  payload: SignaturePayload;
};

export type ConflictNotice = {
  reviewer: string;
  requestId: string;
  againstRequestId: string;
  at: string;
};

export type SessionStatus = 'active' | 'invalidated' | 'reconfirming' | 'sealed';

export type ReviewSession = {
  documentId: string;
  initiatedAt: string;
  round: number;
  frozen: FrozenSnapshot;
  status: SessionStatus;
  baselineStale: boolean;
  signatures: ReviewSignature[];
  invalidations: InvalidationItem[];
  conflictNotice?: ConflictNotice;
  sealedAt?: string;
  audit: AuditEvent[];
};

export type RequestRecord = {
  requestId: string;
  documentId: string;
  reviewer: string;
  createdAt: string;
  state: 'failed' | 'succeeded';
  completedItems: number;
  totalItems: number;
  failReason?: string;
  signatureId?: string;
};

export type ReleasePackage = {
  id: string;
  batchName: string;
  createdAt: string;
  documentIds: string[];
  traces: Array<{
    documentId: string;
    frozenAt: string;
    sealedAt: string;
    signatures: Array<{ reviewer: string; requestId: string; signedAt: string }>;
  }>;
};

type LiveDocLike = {
  id: string;
  pages: number;
  pageOrder: number[];
  pageOrderVersion: number;
  metadataVersion: number;
  redactions: Array<{
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
  }>;
};

export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, '0');
}

const short = (value: string) => value.slice(0, 10);

export function timestamp(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function regionSetVersionOf(doc: LiveDocLike): number {
  return doc.redactions.reduce((sum, region) => sum + region.version, 0);
}

// 发起双人复核时冻结：原始页与发布页分别取指纹，发布页指纹随该页去密区域版本变化。
export function computeSnapshot(doc: LiveDocLike, at = timestamp()): FrozenSnapshot {
  const regions: RegionFingerprint[] = doc.redactions
    .map((region) => ({
      id: region.id,
      page: region.page,
      version: region.version,
      geometry: `${region.x.toFixed(3)},${region.y.toFixed(3)},${region.width.toFixed(3)},${region.height.toFixed(3)}`,
      reason: region.reason,
      privilege: region.privilege,
      status: region.status
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    frozenAt: at,
    pageOrderVersion: doc.pageOrderVersion,
    metadataVersion: doc.metadataVersion,
    regionSetVersion: regionSetVersionOf(doc),
    pages: doc.pageOrder.map((pageNo, index) => {
      const onPage = regions.filter((region) => region.page === pageNo);
      const regionKey = onPage.map((region) => `${region.id}@v${region.version}:${region.geometry}`).join('|');
      return {
        page: pageNo,
        originalHash: short(hashString(`orig:${doc.id}:${pageNo}`)),
        releaseHash: short(hashString(`release:${doc.id}:${pageNo}:${index}:${regionKey}:m${doc.metadataVersion}`))
      };
    }),
    regions
  };
}

// 对照冻结基线与当前实况，列出全部受影响对象（页、元数据、区域）。
export function diffSnapshots(before: FrozenSnapshot, after: FrozenSnapshot, at: string): InvalidationItem[] {
  const items: InvalidationItem[] = [];
  const seen = new Set<string>();
  const push = (item: Omit<InvalidationItem, 'id' | 'detectedAt' | 'resolved'>) => {
    const key = `${item.kind}:${item.objectId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, id: `INV-${key}`, detectedAt: at, resolved: false });
  };

  if (before.pageOrderVersion !== after.pageOrderVersion) {
    after.pages.forEach((current, index) => {
      const frozenPage = before.pages[index];
      if (!frozenPage || frozenPage.page !== current.page) {
        push({
          kind: 'page-order',
          objectId: `page-${current.page}`,
          label: `第 ${current.page} 页`,
          detail: `页序由 v${before.pageOrderVersion} 变为 v${after.pageOrderVersion}，该页现位于第 ${index + 1} 位`
        });
      }
    });
  }

  if (before.metadataVersion !== after.metadataVersion) {
    push({
      kind: 'metadata',
      objectId: 'doc-metadata',
      label: '文档元数据',
      detail: `元数据版本由 v${before.metadataVersion} 变为 v${after.metadataVersion}（作者/修订记录/隐藏字段）`
    });
  }

  const beforeRegions = new Map(before.regions.map((region) => [region.id, region]));
  const afterRegions = new Map(after.regions.map((region) => [region.id, region]));
  if (before.regionSetVersion !== after.regionSetVersion || before.regions.length !== after.regions.length) {
    for (const region of after.regions) {
      const frozen = beforeRegions.get(region.id);
      if (!frozen) {
        push({ kind: 'region', objectId: region.id, label: `区域 ${region.id}`, detail: `新增去密区域（第 ${region.page} 页 · ${region.reason}）` });
      } else if (frozen.version !== region.version || frozen.geometry !== region.geometry || frozen.status !== region.status) {
        push({
          kind: 'region',
          objectId: region.id,
          label: `区域 ${region.id}`,
          detail: `区域版本 v${frozen.version} → v${region.version}（第 ${region.page} 页 · ${region.reason}）`
        });
      }
    }
    for (const region of before.regions) {
      if (!afterRegions.has(region.id)) {
        push({ kind: 'region', objectId: region.id, label: `区域 ${region.id}`, detail: `去密区域已删除（原第 ${region.page} 页）` });
      }
    }
  }
  return items;
}

export function payloadFromSnapshot(frozen: FrozenSnapshot, draft: ReviewDraft): SignaturePayload {
  return {
    pageOrderVersion: frozen.pageOrderVersion,
    metadataVersion: frozen.metadataVersion,
    regionSetVersion: frozen.regionSetVersion,
    pageOrderChoice: draft.pageOrderChoice,
    metadataChoice: draft.metadataChoice,
    regionChoices: Object.fromEntries(frozen.regions.map((region) => [region.id, draft.regionChoices[region.id] ?? '一致'])),
    regionVersions: Object.fromEntries(frozen.regions.map((region) => [region.id, region.version])),
    checks: draft.checks
  };
}

type ConclusionDiff = { scope: string; label: string; reviewerA: string; reviewerB: string };

// 进入发布批次前的三一致比对：页序结论、元数据结论、各区域结论。
export function conclusionDiffs(a: SignaturePayload, b: SignaturePayload): ConclusionDiff[] {
  const diffs: ConclusionDiff[] = [];
  if (a.pageOrderChoice !== b.pageOrderChoice) {
    diffs.push({ scope: '页序', label: '页序与页码连续性', reviewerA: a.pageOrderChoice, reviewerB: b.pageOrderChoice });
  }
  if (a.metadataChoice !== b.metadataChoice) {
    diffs.push({ scope: '元数据', label: '文档元数据清理', reviewerA: a.metadataChoice, reviewerB: b.metadataChoice });
  }
  for (const regionId of new Set([...Object.keys(a.regionChoices), ...Object.keys(b.regionChoices)])) {
    const left = a.regionChoices[regionId] ?? '未结论';
    const right = b.regionChoices[regionId] ?? '未结论';
    if (left !== right) {
      diffs.push({ scope: '区域', label: `区域 ${regionId} 复核结论`, reviewerA: left, reviewerB: right });
    }
  }
  return diffs;
}

export function newRequestId(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `REQ-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

// 旧草稿没有快照版本时的兼容升级：补齐页序与各项版本号，按 v1 基线接入。
export function normalizeLegacyDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const pages = typeof doc.pages === 'number' ? doc.pages : 3;
  if (!Array.isArray(doc.pageOrder)) {
    doc.pageOrder = Array.from({ length: pages }, (_, index) => index + 1);
  }
  if (typeof doc.pageOrderVersion !== 'number') doc.pageOrderVersion = 1;
  if (typeof doc.metadataVersion !== 'number') doc.metadataVersion = 1;
  if (Array.isArray(doc.redactions)) {
    doc.redactions = (doc.redactions as Array<Record<string, unknown>>).map((region) =>
      typeof region.version === 'number' ? region : { ...region, version: 1 }
    );
  }
  return doc;
}
