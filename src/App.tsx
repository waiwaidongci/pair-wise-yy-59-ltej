import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams
} from '@tanstack/react-router';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  FileWarning,
  Highlighter,
  History,
  Layers3,
  Lock,
  Menu,
  RefreshCw,
  RotateCw,
  ScanSearch,
  ShieldCheck,
  Stamp,
  Tags,
  Unlock,
  UploadCloud,
  UserCheck
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Badge, Button, Card, Dialog, Tabs, X } from './components/ui';
import { useDisclosureStore, type DisclosureRecord } from './store';
import {
  REVIEWERS,
  emptyConclusions,
  releaseReadiness,
  useReviewStore,
  type ReviewConclusions,
  type Reviewer
} from './reviewStore';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const bundleQuery = async () => ({
  queue: [
    { id: 'Q-31', name: '第三批补充材料', count: 128, owner: '林清', progress: 68, due: '今日 16:00' },
    { id: 'Q-32', name: '证人材料图像件', count: 47, owner: '周叙', progress: 34, due: '明日 11:00' },
    { id: 'Q-33', name: '专家报告附件', count: 19, owner: '顾言', progress: 91, due: '09-30 18:00' }
  ]
});

function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const links = [
    { to: '/', label: '文档集', icon: Layers3 },
    { to: '/review/$documentId', label: '去密审阅', icon: Highlighter },
    { to: '/quality', label: '发布质检', icon: ScanSearch },
    { to: '/batches', label: '批次与标签', icon: Tags }
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol"><Stamp size={18} /></div>
          <div><strong>披露质控台</strong><span>North Ridge / Litigation Support</span></div>
        </div>
        <div className="top-actions">
          <Badge tone="amber">2 项待质检</Badge>
          <div className="operator"><span>质控员</span><strong>林清 · 审核组</strong></div>
        </div>
        <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="菜单"><Menu /></button>
      </header>
      <div className="shell-body">
        <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
          <div className="workspace-title">
            <span>当前工作区</span>
            <strong>北岭项目 · 诉讼披露</strong>
          </div>
          <nav>
            {links.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to as '/'} activeProps={{ className: 'active' }} onClick={() => setMobileNav(false)}>
                <Icon size={17} /> <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div><ShieldCheck size={16} /><span>审计记录已开启</span></div>
            <small>草稿自动保存在本机</small>
          </div>
        </aside>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}

function DocumentsPage() {
  const documents = useDisclosureStore((state) => state.documents);
  const { data } = useQuery({ queryKey: ['document-queues'], queryFn: bundleQuery });
  const [filter, setFilter] = useState('全部');
  const visible = filter === '全部' ? documents : documents.filter((doc) => doc.status === filter);
  return (
    <div className="page">
      <header className="page-heading">
        <div><small>DISCLOSURE CONTROL / DOCUMENT SET</small><h1>披露文档集</h1><p>分批完成密级复核、敏感区域去密与发布版本比对。</p></div>
        <Button><UploadCloud size={16} /> 导入文档集</Button>
      </header>
      <section className="summary-strip">
        <div><span>文档总数</span><strong>194</strong><small>12.8 GB</small></div>
        <div><span>去密区域</span><strong>2,481</strong><small>较上版 +34</small></div>
        <div><span>待质检</span><strong className="warning-text">17</strong><small>4 项高风险</small></div>
        <div><span>已批准批次</span><strong>6</strong><small>本周 +2</small></div>
      </section>
      <div className="two-column">
        <Card className="document-table-card">
          <div className="card-heading">
            <div><Tabs.Root value={filter} onValueChange={setFilter}><Tabs.List className="segmented">
              {['全部', '去密中', '待质检', '可发布'].map((item) => <Tabs.Trigger key={item} value={item}>{item}</Tabs.Trigger>)}
            </Tabs.List></Tabs.Root></div>
            <span>{visible.length} 份文档</span>
          </div>
          <div className="document-table">
            {visible.map((doc) => (
              <div className="document-row" key={doc.id}>
                <div className="file-icon"><FileText size={19} /></div>
                <div className="doc-main">
                  <strong>{doc.title}</strong>
                  <span>{doc.id} · {doc.bundle} · {doc.size}</span>
                </div>
                <div className="doc-field"><span>密级</span><Badge tone={doc.classification === '严格机密' ? 'red' : doc.classification === '机密' ? 'amber' : 'neutral'}>{doc.classification}</Badge></div>
                <div className="doc-field"><span>负责人员</span><strong>{doc.owner}</strong></div>
                <div className="doc-field"><span>状态</span><Badge tone={doc.status === '可发布' ? 'green' : doc.status === '待质检' ? 'amber' : 'blue'}>{doc.status}</Badge></div>
                <div className="doc-actions">
                  <Link to="/review/$documentId" params={{ documentId: doc.id }}><Button variant="outline">审阅</Button></Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <aside className="side-stack">
          <Card className="queue-card">
            <div className="card-title"><ClipboardCheck size={17} /><strong>去密任务队列</strong></div>
            {(data?.queue ?? []).map((item) => (
              <div className="queue-item" key={item.id}>
                <div><strong>{item.name}</strong><span>{item.count} 份 · {item.owner}</span></div>
                <div className="progress"><i style={{ width: `${item.progress}%` }} /></div>
                <small>{item.progress}% · 截止 {item.due}</small>
              </div>
            ))}
          </Card>
          <Card className="audit-card">
            <div className="card-title"><ShieldCheck size={17} /><strong>最近操作</strong></div>
            <p><b>09:48</b> 林清确认 DOC-00418 的合同价款遮蔽区域。</p>
            <p><b>09:31</b> 周叙提交会议纪要待质检。</p>
            <p><b>08:54</b> 顾言导出 DOC-00435 发布清单。</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function useDemoPdf() {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    let alive = true;
    PDFDocument.create().then(async (pdf) => {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (let pageNo = 1; pageNo <= 3; pageNo += 1) {
        const page = pdf.addPage([612, 792]);
        page.drawText(`NORTH RIDGE PROJECT - DISCLOSURE EXHIBIT`, { x: 54, y: 728, size: 14, font, color: rgb(0.12, 0.16, 0.2) });
        page.drawText(`Document page ${pageNo} / 3`, { x: 54, y: 704, size: 10, font, color: rgb(0.35, 0.39, 0.43) });
        page.drawLine({ start: { x: 54, y: 690 }, end: { x: 558, y: 690 }, thickness: 1, color: rgb(0.75, 0.78, 0.8) });
        const lines = [
          'Commercial terms and operational records',
          'Parties: North Ridge Equipment Co. and Haiyang Logistics',
          'Reference No. NR-2026-0819 / Confidentiality class: strictly confidential',
          '',
          'The supplier shall provide maintenance records, operating data and',
          'incident reports within ten business days after each quarterly review.',
          '',
          'Contact: [redacted personal information]',
          'Commercial consideration: [redacted third-party quotation]',
          '',
          'This copy is prepared solely for disclosure review. Every marked region',
          'must be confirmed against the original before approval and release.'
        ];
        lines.forEach((line, index) => page.drawText(line, { x: 54, y: 655 - index * 24, size: 10, font, color: rgb(0.1, 0.13, 0.16) }));
        page.drawText(`Control stamp: REVIEW-${String(pageNo).padStart(2, '0')}`, { x: 54, y: 72, size: 9, font, color: rgb(0.5, 0.53, 0.56) });
      }
      return pdf.save();
    }).then((data) => {
      if (alive) {
        const copy = new Uint8Array(data);
        setBytes(copy.buffer as ArrayBuffer);
      }
    });
    return () => { alive = false; };
  }, []);
  return bytes;
}

function PdfPage({ pageNumber, redacted = false, onDraw }: { pageNumber: number; redacted?: boolean; onDraw?: (region: { x: number; y: number; width: number; height: number }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bytes = useDemoPdf();
  const [drawing, setDrawing] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const start = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!bytes || !canvasRef.current) return;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    const render = async () => {
      task = pdfjs.getDocument({ data: bytes.slice(0) });
      const pdf = await task.promise;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = canvasRef.current!;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = '100%';
      canvas.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      const context = canvas.getContext('2d')!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    };
    render().catch(console.error);
    return () => { task?.destroy(); };
  }, [bytes, pageNumber]);

  const pointerDown = (event: React.PointerEvent) => {
    if (!onDraw) return;
    const rect = event.currentTarget.getBoundingClientRect();
    start.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDrawing({ x: start.current.x / rect.width, y: start.current.y / rect.height, width: 0, height: 0 });
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (!drawing || !onDraw) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(start.current.x, event.clientX - rect.left) / rect.width;
    const y = Math.min(start.current.y, event.clientY - rect.top) / rect.height;
    const width = Math.abs(event.clientX - rect.left - start.current.x) / rect.width;
    const height = Math.abs(event.clientY - rect.top - start.current.y) / rect.height;
    setDrawing({ x, y, width, height });
  };
  const pointerUp = () => {
    if (drawing && onDraw && drawing.width > 0.015 && drawing.height > 0.01) onDraw(drawing);
    setDrawing(null);
  };
  return (
    <div className={`pdf-page ${onDraw ? 'drawable' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}>
      <canvas ref={canvasRef} />
      {redacted && <div className="page-redaction-demo"><span>已发布区域掩码</span></div>}
      {drawing && <i className="drawing-region" style={{ left: `${drawing.x * 100}%`, top: `${drawing.y * 100}%`, width: `${drawing.width * 100}%`, height: `${drawing.height * 100}%` }} />}
    </div>
  );
}

function ReviewPage() {
  const { documentId } = useParams({ from: '/review/$documentId' });
  const navigate = useNavigate();
  const { documents, activePage, redactionMode, activeRedactionId } = useDisclosureStore();
  const store = useDisclosureStore();
  const doc = documents.find((item) => item.id === documentId) ?? documents[0];
  const pageRegions = doc.redactions.filter((item) => item.page === activePage);
  const active = doc.redactions.find((item) => item.id === activeRedactionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('商业秘密');
  const [privilege, setPrivilege] = useState('合同保密');
  return (
    <div className="page review-page">
      <header className="review-header">
        <div className="review-title">
          <Button variant="ghost" onClick={() => navigate({ to: '/' })}><ArrowLeft size={16} /></Button>
          <div><small>{doc.id} / 去密审阅</small><h1>{doc.title}</h1></div>
          <Badge tone={doc.classification === '严格机密' ? 'red' : 'amber'}>{doc.classification}</Badge>
        </div>
        <div className="review-actions">
          <Button variant="outline" onClick={() => store.toggleRedactionMode()} className={redactionMode ? 'active-button' : ''}><Highlighter size={16} /> {redactionMode ? '取消绘制' : '绘制去密区'}</Button>
          <Button variant="outline" onClick={() => setDialogOpen(true)}><FileCheck2 size={16} /> 发布前校验</Button>
          <Button><Check size={16} /> 提交质检</Button>
        </div>
      </header>
      <div className="review-layout">
        <aside className="page-thumbs">
          <div className="side-label">页级预览 <span>{doc.pages} 页</span></div>
          {[1, 2, 3].map((page) => (
            <button key={page} className={activePage === page ? 'active' : ''} onClick={() => store.setPage(page)}>
              <div className="mini-page"><span>{page}</span><i style={{ width: `${45 + page * 9}%` }} /><i style={{ width: `${70 - page * 5}%` }} /><i style={{ width: `${55 + page * 4}%` }} /></div>
              <small>第 {page} 页</small>
            </button>
          ))}
        </aside>
        <section className="viewer-column">
          <div className="viewer-toolbar">
            <div><button onClick={() => store.setPage(Math.max(1, activePage - 1))} disabled={activePage === 1}><ChevronLeft size={16} /></button><strong>{activePage} / {doc.pages}</strong><button onClick={() => store.setPage(Math.min(doc.pages, activePage + 1))} disabled={activePage === doc.pages}><ChevronRight size={16} /></button></div>
            <span>125%</span>
            <span>原页 · 掩码叠加</span>
          </div>
          <div className="pdf-stage">
            <PdfPage
              pageNumber={activePage}
              onDraw={redactionMode ? (region) => store.addRedaction({ ...region, page: activePage, reason, privilege }) : undefined}
            />
            {pageRegions.map((region) => (
              <button
                key={region.id}
                className={`redaction-region ${region.status} ${activeRedactionId === region.id ? 'selected' : ''}`}
                style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
                onClick={() => store.selectRedaction(region.id)}
                title={`${region.reason} / ${region.privilege}`}
              />
            ))}
          </div>
        </section>
        <aside className="inspector">
          <div className="side-label">区域属性</div>
          {active ? (
            <>
              <div className="inspector-title"><strong>{active.reason}</strong><Badge tone={active.status === 'confirmed' ? 'green' : 'amber'}>{active.status === 'confirmed' ? '已确认' : '草稿'}</Badge></div>
              <label>保密级别<select value={doc.classification} onChange={(event) => store.updateClassification(event.target.value as DisclosureRecord['classification'])}><option>内部</option><option>机密</option><option>严格机密</option></select></label>
              <label>去密原因<input value={active.reason} readOnly /></label>
              <label>特权标签<input value={active.privilege} readOnly /></label>
              <label>责任人员<input value={doc.owner} readOnly /></label>
              <div className="coordinate-grid"><div><span>X</span><b>{Math.round(active.x * 100)}%</b></div><div><span>Y</span><b>{Math.round(active.y * 100)}%</b></div><div><span>宽</span><b>{Math.round(active.width * 100)}%</b></div><div><span>高</span><b>{Math.round(active.height * 100)}%</b></div></div>
              <Button onClick={() => store.confirmRedaction(active.id)} disabled={active.status === 'confirmed'}><Check size={15} /> 确认此区域</Button>
              <Button variant="outline"><Copy size={15} /> 批量复制到同类页</Button>
            </>
          ) : <p className="muted">在文档页面上选择一个去密区域查看属性。</p>}
          <div className="rule-note"><AlertTriangle size={16} /><span>发布版本不得包含原始文本层或图片残片。</span></div>
        </aside>
      </div>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>发布前校验</Dialog.Title>
            <Dialog.Description>系统将核对原始页与发布页的一致性，并检查元数据残留。</Dialog.Description>
            <div className="dialog-checks">
              <p><Check /> {doc.redactions.length} 个去密区域已定位</p>
              <p><Check /> 文档版本与操作者记录完整</p>
              <p className={doc.redactions.some((item) => item.status === 'draft') ? 'failed' : ''}><AlertTriangle /> {doc.redactions.some((item) => item.status === 'draft') ? '仍有未确认区域' : '所有区域已确认'}</p>
            </div>
            <Dialog.Close asChild><Button>返回检查 <X size={15} /></Button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function QualityPage() {
  const { documents } = useDisclosureStore();
  const touchReview = useReviewStore((state) => state.touchReview);
  const reconcile = useReviewStore((state) => state.reconcile);
  const signReview = useReviewStore((state) => state.signReview);
  const retryWrite = useReviewStore((state) => state.retryWrite);
  const refreeze = useReviewStore((state) => state.refreeze);
  const resolveInvalidation = useReviewStore((state) => state.resolveInvalidation);
  const clearConflictDraft = useReviewStore((state) => state.clearConflictDraft);
  const setFaultInjection = useReviewStore((state) => state.setFaultInjection);
  const [docId, setDocId] = useState('DOC-00427');
  const doc = documents.find((item) => item.id === docId) ?? documents[0];
  const review = useReviewStore((state) => state.reviews[doc.id]);
  const faultInjection = useReviewStore((state) => state.faultInjection);
  const writes = useReviewStore((state) => Object.values(state.writes).filter((w) => w.documentId === doc.id));

  const [conclusions, setConclusions] = useState<Record<string, ReviewConclusions>>({});
  const [requestNos, setRequestNos] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ type: 'ok' | 'err' | 'conflict'; msg: string } | null>(null);

  // 进入复核页：旧草稿无快照版本时先兼容升级。
  useEffect(() => { touchReview(doc.id); }, [doc.id, touchReview]);
  // 文档变化后对账：页序 / 元数据 / 区域版本变化会触发签署失效。
  useEffect(() => {
    reconcile(doc.id);
  }, [doc.id, reconcile, doc.redactions, doc.classification, doc.pages, doc.title, doc.bundle]);
  // 新一轮复核：清空两人结论与请求号。
  useEffect(() => {
    setConclusions({});
    setRequestNos({});
  }, [review?.round]);

  const readiness = releaseReadiness(review);
  const signedIds = new Set((review?.signatures ?? []).map((s) => s.reviewerId));
  const allRegionIds = doc.redactions.map((r) => r.id);

  const getConclusions = (reviewerId: string): ReviewConclusions => conclusions[reviewerId] ?? emptyConclusions();
  const updateConclusions = (reviewerId: string, patch: Partial<ReviewConclusions>) => {
    setConclusions((prev) => ({ ...prev, [reviewerId]: { ...(prev[reviewerId] ?? emptyConclusions()), ...patch } }));
  };

  const handleSign = (reviewer: Reviewer) => {
    const c = getConclusions(reviewer.id);
    const full: ReviewConclusions = {
      pageOrderOk: c.pageOrderOk,
      metadataClean: c.metadataClean,
      regionIds: c.regionIds.length > 0 ? c.regionIds : allRegionIds
    };
    const requestNo = requestNos[reviewer.id] ?? `REQ-${Date.now()}-${reviewer.id}`;
    if (!requestNos[reviewer.id]) setRequestNos((prev) => ({ ...prev, [reviewer.id]: requestNo }));
    const res = signReview({
      documentId: doc.id,
      requestNo,
      reviewerId: reviewer.id,
      conclusions: full,
      snapshotVersion: review?.snapshot?.snapshotVersion ?? 1,
      simulateFailure: faultInjection
    });
    if (res.ok) {
      setFlash({ type: 'ok', msg: res.reused ? `已沿用第一次结果（${requestNo}），未新增签署` : `已接收 ${reviewer.name} 的签署（${requestNo}）` });
    } else if (res.conflict) {
      setFlash({ type: 'conflict', msg: '递交冲突：只接收先到版本，本递交已保留为草稿' });
    } else {
      setFlash({ type: 'err', msg: res.error ?? '写入失败' });
    }
  };

  const handleRetry = (requestNo: string) => {
    const res = retryWrite(requestNo);
    setFlash({ type: res.ok ? 'ok' : 'err', msg: res.ok ? `已凭原请求号 ${requestNo} 恢复，沿用第一次结果` : (res.error ?? '恢复失败') });
  };

  const kindLabel = (kind: string) => (kind === 'page-order' ? '页序' : kind === 'metadata' ? '元数据' : '区域');
  const kindTone = (kind: string) => (kind === 'page-order' ? 'blue' : kind === 'metadata' ? 'amber' : 'red');

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <small>QUALITY ASSURANCE / DUAL REVIEW</small>
          <h1>发布质控双人复核</h1>
          <p>发起即冻结原始页、发布页、去密区域与复核结论；两人签署后任何页序、元数据或区域版本变化，两份签署一起失效并锁定发布包。</p>
        </div>
        <div className="heading-actions">
          <label className="doc-picker">
            <span>复核文档</span>
            <select value={docId} onChange={(e) => setDocId(e.target.value)}>
              {documents.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={() => refreeze(doc.id, '林清')}><RotateCw size={15} /> 重新冻结快照</Button>
        </div>
      </header>

      {flash && (
        <div className={`flash-banner ${flash.type}`}>
          {flash.type === 'ok' ? <Check size={16} /> : flash.type === 'conflict' ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
          <span>{flash.msg}</span>
          <button onClick={() => setFlash(null)} aria-label="关闭">×</button>
        </div>
      )}

      {/* 冻结快照条 */}
      <div className="snapshot-banner">
        <div className="snapshot-main">
          <FileSignature size={17} />
          <div>
            <strong>冻结快照 v{review?.snapshot?.snapshotVersion ?? 0}</strong>
            <span>
              {review?.snapshot
                ? `轮次 ${review.round} · 冻结于 ${new Date(review.snapshot.frozenAt).toLocaleTimeString('zh-CN', { hour12: false })} · ${review.snapshot.frozenBy} · ${review.snapshot.pageCount} 页 · ${review.snapshot.regions.length} 个区域`
                : '尚未冻结'}
            </span>
          </div>
        </div>
        <div className="snapshot-tags">
          {review?.legacyUpgraded && <Badge tone="blue"><History size={11} /> 旧草稿已兼容升级</Badge>}
          <Badge tone={review?.releaseBlocked ? 'red' : 'green'}>
            {review?.releaseBlocked ? <Lock size={11} /> : <Unlock size={11} />}
            {review?.releaseBlocked ? '发布包已锁定' : '发布包未锁定'}
          </Badge>
          <Badge tone="neutral">签署 {review?.signatures.length ?? 0}/2</Badge>
        </div>
      </div>

      <div className="comparison-banner">
        <div><Eye size={17} /><strong>{doc.title}</strong><span>{doc.id} · {doc.bundle}</span></div>
        <Badge tone={signedIds.size === 2 ? 'green' : 'amber'}>{signedIds.size === 2 ? '双人已签署' : `等待复审员 ${signedIds.size}/2`}</Badge>
      </div>
      <div className="compare-grid">
        <Card className="compare-panel"><div className="compare-head"><span>原始页</span><Badge tone="neutral">源文件 · 已冻结</Badge></div><div className="compare-page"><PdfPage pageNumber={1} /></div></Card>
        <Card className="compare-panel"><div className="compare-head"><span>发布页</span><Badge tone="green">已遮蔽 · 已冻结</Badge></div><div className="compare-page redacted-preview"><PdfPage pageNumber={1} redacted /><div className="demo-mask mask-one" /><div className="demo-mask mask-two" /></div></Card>
      </div>

      <div className="dual-review-grid">
        {REVIEWERS.map((reviewer) => {
          const sig = review?.signatures.find((s) => s.reviewerId === reviewer.id);
          const c = getConclusions(reviewer.id);
          const draft = review?.conflictDraft?.reviewerId === reviewer.id ? review.conflictDraft : null;
          return (
            <Card key={reviewer.id} className={`sign-card ${sig ? 'signed' : ''}`}>
              <div className="sign-head">
                <div className="sign-avatar"><UserCheck size={16} /></div>
                <div>
                  <strong>{reviewer.name}</strong>
                  <span>{reviewer.role}</span>
                </div>
                <Badge tone={sig ? 'green' : 'amber'}>{sig ? '已签署' : '未签署'}</Badge>
              </div>

              {sig ? (
                <div className="sign-meta">
                  <p><Check size={13} /> 已于 {new Date(sig.signedAt).toLocaleTimeString('zh-CN', { hour12: false })} 签署</p>
                  <p>请求号 <code>{sig.requestNo}</code></p>
                  <p>快照版本 v{sig.snapshotVersion} · 结论哈希 <code>{sig.conclusionsHash}</code></p>
                </div>
              ) : (
                <div className="sign-form">
                  <label className={c.pageOrderOk ? 'on' : ''}>
                    <input type="checkbox" checked={c.pageOrderOk} onChange={(e) => updateConclusions(reviewer.id, { pageOrderOk: e.target.checked })} />
                    <span><strong>页序核对</strong><small>页序连续，无拆页、合并或漏页</small></span>
                  </label>
                  <label className={c.metadataClean ? 'on' : ''}>
                    <input type="checkbox" checked={c.metadataClean} onChange={(e) => updateConclusions(reviewer.id, { metadataClean: e.target.checked })} />
                    <span><strong>元数据清理</strong><small>作者、修订人、批注与隐藏字段已清除</small></span>
                  </label>
                  <label className={c.regionIds.length === allRegionIds.length && allRegionIds.length > 0 ? 'on' : ''}>
                    <input
                      type="checkbox"
                      checked={c.regionIds.length === allRegionIds.length && allRegionIds.length > 0}
                      onChange={(e) => updateConclusions(reviewer.id, { regionIds: e.target.checked ? allRegionIds : [] })}
                    />
                    <span><strong>各区域结论一致</strong><small>{allRegionIds.length} 个去密区域已逐区核对</small></span>
                  </label>
                  <Button
                    onClick={() => handleSign(reviewer)}
                    disabled={!c.pageOrderOk || !c.metadataClean || !(c.regionIds.length === allRegionIds.length && allRegionIds.length > 0)}
                  >
                    <FileSignature size={15} /> 确认并签署
                  </Button>
                </div>
              )}

              {draft && (
                <div className="conflict-draft">
                  <div className="conflict-head"><AlertOctagon size={14} /><strong>冲突 · 草稿已保留</strong></div>
                  <p>{draft.reason}</p>
                  <p>请求号 <code>{draft.requestNo}</code> · {new Date(draft.keptAt).toLocaleTimeString('zh-CN', { hour12: false })}</p>
                  <Button variant="outline" onClick={() => clearConflictDraft(doc.id)}>放弃草稿</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 失效项清单 */}
      <Card className="invalidation-card">
        <div className="card-title"><FileWarning size={17} /><strong>失效项与受影响对象</strong><span>{review?.invalidations.filter((i) => !i.resolved).length ?? 0} 项未清</span></div>
        {(review?.invalidations.length ?? 0) === 0 ? (
          <p className="muted">初审后若页序、元数据或任一区域版本变化，两份签署将一起失效并在此列出受影响对象。</p>
        ) : (
          <div className="invalidation-list">
            {review!.invalidations.map((item) => (
              <div key={item.id} className={`invalidation-row ${item.resolved ? 'resolved' : ''}`}>
                <Badge tone={kindTone(item.kind)}>{kindLabel(item.kind)}</Badge>
                <div className="invalidation-main">
                  <strong>{item.label}</strong>
                  <span>{item.reason}</span>
                </div>
                <small>{new Date(item.detectedAt).toLocaleTimeString('zh-CN', { hour12: false })}</small>
                {item.resolved
                  ? <Badge tone="green">已结清</Badge>
                  : <Button variant="outline" onClick={() => resolveInvalidation(doc.id, item.id)}>结清</Button>}
              </div>
            ))}
          </div>
        )}
        {review && review.signatureHistory.length > 0 && (
          <div className="signature-history">
            <div className="card-title"><History size={15} /><strong>签署历史（失效留痕）</strong></div>
            {review.signatureHistory.slice(0, 4).map((sig, idx) => (
              <p key={`${sig.requestNo}-${idx}`} className={sig.valid ? '' : 'invalid'}>
                {sig.valid ? <Check size={12} /> : <AlertOctagon size={12} />}
                {sig.reviewerName} · v{sig.snapshotVersion} · {sig.requestNo} · {sig.valid ? '有效' : '已失效'}
              </p>
            ))}
          </div>
        )}
      </Card>

      {/* 发布门禁 */}
      <Card className={`release-gate ${readiness.ready ? 'ready' : ''}`}>
        <div className="card-title">
          <ShieldCheck size={17} /><strong>发布批次门禁</strong>
          <Badge tone={readiness.ready ? 'green' : 'red'}>{readiness.ready ? '可进入发布批次' : '未通过'}</Badge>
        </div>
        {readiness.ready ? (
          <p className="ready-note"><Check size={14} /> 两人已签署同一快照版本，页序、元数据与各区域结论一致，可生成发布包。</p>
        ) : (
          <ul className="gate-reasons">
            {readiness.reasons.map((reason) => <li key={reason}><AlertTriangle size={13} /> {reason}</li>)}
          </ul>
        )}
      </Card>

      {/* 写入台账与幂等恢复 */}
      <Card className="writes-card">
        <div className="card-title">
          <RefreshCw size={17} /><strong>写入台账与请求号恢复</strong>
          <label className="fault-toggle">
            <input type="checkbox" checked={faultInjection} onChange={(e) => setFaultInjection(e.target.checked)} />
            <span>模拟写入失败</span>
          </label>
        </div>
        {writes.length === 0 ? (
          <p className="muted">递交签署后在此留痕；写入失败可凭原请求号从最后一个完整复核项继续，重复重试沿用第一次结果。</p>
        ) : (
          <div className="writes-list">
            {writes.map((w) => (
              <div key={w.requestNo} className={`write-row ${w.status}`}>
                <div className="write-main">
                  <strong><code>{w.requestNo}</code></strong>
                  <span>{w.type === 'sign' ? '签署递交' : '重新冻结'} · {w.steps.filter((s) => s.done).length}/{w.steps.length} 项完成{w.reused ? ' · 沿用第一次结果' : ''}</span>
                  {w.resultSummary && <small>{w.resultSummary}</small>}
                </div>
                {w.status === 'committed' && <Badge tone="green">已提交</Badge>}
                {w.status === 'failed' && <Badge tone="red">失败</Badge>}
                {w.status === 'pending' && <Badge tone="amber">处理中</Badge>}
                {w.status === 'failed' && <Button variant="outline" onClick={() => handleRetry(w.requestNo)}><RotateCw size={13} /> 凭原请求号恢复</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BatchesPage() {
  const { documents } = useDisclosureStore();
  const reviews = useReviewStore((state) => state.reviews);
  const [selected, setSelected] = useState<string[]>(['DOC-00418']);
  const activeDoc = documents.find((doc) => doc.id === selected[0]) ?? documents[0];
  const selectedReviews = selected.map((id) => ({ id, review: reviews[id], readiness: releaseReadiness(reviews[id]) }));
  const allReady = selectedReviews.length > 0 && selectedReviews.every((item) => item.readiness.ready);
  const blockedReasons = selectedReviews.flatMap((item) => item.readiness.reasons.map((reason) => `${item.id}：${reason}`));
  return (
    <div className="page">
      <header className="page-heading">
        <div><small>RELEASE BATCH / TAXONOMY</small><h1>发布批次与标签</h1><p>按案件问题、辖区和披露对象组织文档，双人复核一致后才生成可追溯发布清单。</p></div>
        <Button disabled={!allReady}><Lock size={15} /> 生成发布包</Button>
      </header>
      {!allReady && (
        <div className="flash-banner conflict">
          <AlertOctagon size={16} />
          <span>所选文档未全部通过双人复核，发布包已锁定：{blockedReasons.join('；')}</span>
        </div>
      )}
      <div className="batch-layout">
        <Card className="batch-list"><div className="card-title"><Layers3 size={17} /><strong>发布批次</strong></div>{['第一批披露 · 审阅中', '第二批披露 · 编制中', '专家材料 · 待补充'].map((name, index) => <button key={name} className={index === 0 ? 'active' : ''}><span>BATCH-{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><small>{[48, 79, 19][index]} 份文档</small></button>)}</Card>
        <Card className="batch-content">
          <div className="card-title"><Tags size={17} /><strong>文档与案件问题映射</strong><span>{selected.length} 已选择</span></div>
          <div className="batch-table">
            {documents.map((doc) => {
              const rd = releaseReadiness(reviews[doc.id]);
              const rv = reviews[doc.id];
              return (
                <label key={doc.id} className="batch-row">
                  <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => setSelected((ids) => ids.includes(doc.id) ? ids.filter((id) => id !== doc.id) : [...ids, doc.id])} />
                  <FileText size={17} />
                  <div>
                    <strong>{doc.title}</strong>
                    <span>{doc.id} · {doc.issue}</span>
                    {rv?.snapshot && <span className="trace-line"><FileSignature size={11} /> 快照 v{rv.snapshot.snapshotVersion} · 签署 {rv.signatures.length}/2 · 轮次 {rv.round}</span>}
                  </div>
                  <Badge tone={rd.ready ? 'green' : rv?.releaseBlocked ? 'red' : 'amber'}>{rd.ready ? '可发布' : rv?.releaseBlocked ? '已锁定' : '复核中'}</Badge>
                </label>
              );
            })}
          </div>
          <div className="tag-editor">
            <h3>标签与分发级</h3>
            <div className="tag-options">{(['合同问题', '设备缺陷', '现场安全', '损害赔偿', '仅律师可见']).map((tag, index) => <span key={tag} className={index < 3 ? 'selected' : ''}>{tag}</span>)}</div>
            <label>导出清单说明<textarea defaultValue="按案卷编号升序导出，保留冻结快照版本、两位签署人、请求号与审批时间，支持按请求号追溯。" /></label>
            <Button disabled={!allReady}><Lock size={14} /> 保存并生成发布包</Button>
          </div>
        </Card>
        <Card className="batch-summary">
          <div className="side-label">当前批次摘要</div>
          <strong>{activeDoc.bundle}</strong>
          <dl>
            <div><dt>文档</dt><dd>{selected.length}</dd></div>
            <div><dt>页数</dt><dd>{selected.reduce((sum, id) => sum + (documents.find((doc) => doc.id === id)?.pages ?? 0), 0)}</dd></div>
            <div><dt>双人复核</dt><dd>{selectedReviews.filter((item) => item.readiness.ready).length}/{selected.length} 通过</dd></div>
            <div><dt>风险项</dt><dd>4</dd></div>
          </dl>
          <div className={`summary-note ${allReady ? 'ok' : ''}`}>
            {allReady ? <Check size={15} /> : <AlertTriangle size={15} />}
            <span>{allReady ? '所选文档均已通过双人复核，可生成发布包。' : '发布前仍需完成双人复核并清除失效项。'}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({ component: AppShell });
const documentsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DocumentsPage });
const reviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/review/$documentId', component: ReviewPage });
const qualityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/quality', component: QualityPage });
const batchesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/batches', component: BatchesPage });
const routeTree = rootRoute.addChildren([documentsRoute, reviewRoute, qualityRoute, batchesRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

export default function App() {
  return <RouterProvider router={router} />;
}
