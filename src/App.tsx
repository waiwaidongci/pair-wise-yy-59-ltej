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
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  FileCheck2,
  FileText,
  Highlighter,
  History,
  Layers3,
  Lock,
  Menu,
  PackageCheck,
  PenLine,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Stamp,
  Tags,
  UploadCloud,
  UserCheck,
  Users,
  X,
  Zap
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Badge, Button, Card, Dialog, Tabs } from './components/ui';
import { REVIEW_CHECK_ITEMS, useDisclosureStore, type DisclosureRecord } from './store';
import type { ReviewSession } from './review';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const bundleQuery = async () => ({
  queue: [
    { id: 'Q-31', name: '第三批补充材料', count: 128, owner: '林清', progress: 68, due: '今日 16:00' },
    { id: 'Q-32', name: '证人材料图像件', count: 47, owner: '周叙', progress: 34, due: '明日 11:00' },
    { id: 'Q-33', name: '专家报告附件', count: 19, owner: '顾言', progress: 91, due: '09-30 18:00' }
  ]
});

const REVIEWERS = ['林清', '周叙'];

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
          <Badge tone="neutral">页序 v{doc.pageOrderVersion} · 元数据 v{doc.metadataVersion}</Badge>
        </div>
        <div className="review-actions">
          <Button variant="outline" onClick={() => store.toggleRedactionMode()} className={redactionMode ? 'active-button' : ''}><Highlighter size={16} /> {redactionMode ? '取消绘制' : '绘制去密区'}</Button>
          <Button variant="outline" onClick={() => setDialogOpen(true)}><FileCheck2 size={16} /> 发布前校验</Button>
          <Link to="/quality"><Button><UserCheck size={16} /> 进入双人复核</Button></Link>
        </div>
      </header>
      <div className="review-layout">
        <aside className="page-thumbs">
          <div className="side-label">页级预览 <span>{doc.pages} 页 · 序 v{doc.pageOrderVersion}</span></div>
          {doc.pageOrder.map((page, index) => (
            <button key={page} className={activePage === page ? 'active' : ''} onClick={() => store.setPage(page)}>
              <div className="mini-page"><span>{page}</span><i style={{ width: `${45 + ((index + page) % 3) * 9}%` }} /><i style={{ width: `${70 - ((index + page) % 3) * 5}%` }} /><i style={{ width: `${55 + ((index + page) % 3) * 4}%` }} /></div>
              <small>位 {index + 1} · 第 {page} 页</small>
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
                title={`${region.reason} / ${region.privilege} / v${region.version}`}
              />
            ))}
          </div>
        </section>
        <aside className="inspector">
          <div className="side-label">区域属性</div>
          {active ? (
            <>
              <div className="inspector-title"><strong>{active.reason}</strong><Badge tone={active.status === 'confirmed' ? 'green' : 'amber'}>{active.status === 'confirmed' ? `已确认 · v${active.version}` : `草稿 · v${active.version}`}</Badge></div>
              <label>保密级别<select value={doc.classification} onChange={(event) => store.updateClassification(event.target.value as DisclosureRecord['classification'])}><option>内部</option><option>机密</option><option>严格机密</option></select></label>
              <label>去密原因<input value={active.reason} readOnly /></label>
              <label>特权标签<input value={active.privilege} readOnly /></label>
              <label>责任人员<input value={doc.owner} readOnly /></label>
              <div className="coordinate-grid"><div><span>X</span><b>{Math.round(active.x * 100)}%</b></div><div><span>Y</span><b>{Math.round(active.y * 100)}%</b></div><div><span>宽</span><b>{Math.round(active.width * 100)}%</b></div><div><span>高</span><b>{Math.round(active.height * 100)}%</b></div></div>
              <Button onClick={() => store.confirmRedaction(active.id)} disabled={active.status === 'confirmed'}><Check size={15} /> 确认此区域（版本 +1）</Button>
              <Button variant="outline"><Copy size={15} /> 批量复制到同类页</Button>
            </>
          ) : <p className="muted">在文档页面上选择一个去密区域查看属性。</p>}
          <div className="rule-note"><AlertTriangle size={16} /><span>发布版本不得包含原始文本层或图片残片；区域/元数据变更会使已递交的双签失效。</span></div>
        </aside>
      </div>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <div className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>发布前校验</Dialog.Title>
            <Dialog.Description>系统将核对原始页与发布页的一致性，并检查元数据残留。</Dialog.Description>
            <div className="dialog-checks">
              <p><Check /> {doc.redactions.length} 个去密区域已定位（区域版本合计 v{doc.redactions.reduce((sum, region) => sum + region.version, 0)}）</p>
              <p><Check /> 页序 v{doc.pageOrderVersion} · 元数据 v{doc.metadataVersion}</p>
              <p className={doc.redactions.some((item) => item.status === 'draft') ? 'failed' : ''}><AlertTriangle /> {doc.redactions.some((item) => item.status === 'draft') ? '仍有未确认区域' : '所有区域已确认'}</p>
            </div>
            <Dialog.Close asChild><Button>返回检查 <X size={15} /></Button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

const statusMeta: Record<ReviewSession['status'], { label: string; tone: 'neutral' | 'amber' | 'red' | 'green' | 'blue' }> = {
  active: { label: '双签进行中', tone: 'blue' },
  invalidated: { label: '签署失效 · 处理中', tone: 'red' },
  reconfirming: { label: '等待两人重新确认', tone: 'amber' },
  sealed: { label: '已封印 · 可发布', tone: 'green' }
};

function FrozenPanel({ session, doc }: { session: ReviewSession; doc: DisclosureRecord }) {
  const open = session.invalidations.some((item) => !item.resolved);
  return (
    <Card className={`frozen-card ${open ? 'locked' : ''}`}>
      <div className="card-title">
        <Snowflake size={17} />
        <strong>发起冻结快照</strong>
        {open && <Badge tone="red"><Lock size={12} /> 处理中 · 发布包冻结</Badge>}
      </div>
      <div className="freeze-grid">
        <div><span>冻结时间</span><b>{session.frozen.frozenAt}{session.frozen.refrozenAt && <small>（{session.frozen.refrozenAt} 刷新）</small>}</b></div>
        <div><span>原始页</span><b>{session.frozen.pages.length} 页指纹</b></div>
        <div><span>发布页</span><b>{session.frozen.pages.length} 页掩码指纹</b></div>
        <div><span>去密区域</span><b>{session.frozen.regions.length} 个</b></div>
        <div><span>页序版本</span><b className={session.frozen.pageOrderVersion !== doc.pageOrderVersion ? 'danger-text' : ''}>v{session.frozen.pageOrderVersion}{session.frozen.pageOrderVersion !== doc.pageOrderVersion && ` → v${doc.pageOrderVersion}`}</b></div>
        <div><span>元数据版本</span><b className={session.frozen.metadataVersion !== doc.metadataVersion ? 'danger-text' : ''}>v{session.frozen.metadataVersion}{session.frozen.metadataVersion !== doc.metadataVersion && ` → v${doc.metadataVersion}`}</b></div>
        <div><span>区域版本合计</span><b className={session.frozen.regionSetVersion !== doc.redactions.reduce((sum, region) => sum + region.version, 0) ? 'danger-text' : ''}>v{session.frozen.regionSetVersion}{session.frozen.regionSetVersion !== doc.redactions.reduce((sum, region) => sum + region.version, 0) ? ` → v${doc.redactions.reduce((sum, region) => sum + region.version, 0)}` : ''}</b></div>
      </div>
      <div className="fingerprint-list">
        {session.frozen.pages.map((page) => (
          <div key={page.page} className="fingerprint-row">
            <span>第 {page.page} 页</span>
            <code>原 {page.originalHash}</code>
            <code>发 {page.releaseHash}</code>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InvalidationPanel({ documentId, session }: { documentId: string; session: ReviewSession }) {
  const store = useDisclosureStore();
  const open = session.invalidations.filter((item) => !item.resolved);
  if (session.invalidations.length === 0) {
    return (
      <Card className="invalidation-card clean">
        <div className="card-title"><ShieldCheck size={17} /><strong>失效对象</strong><Badge tone="green">无漂移</Badge></div>
        <p className="muted">页序、元数据、各区域版本与冻结基线一致，两份签署保持有效。</p>
      </Card>
    );
  }
  return (
    <Card className={`invalidation-card ${open.length > 0 ? 'has-open' : ''}`}>
      <div className="card-title">
        <ShieldAlert size={17} />
        <strong>失效对象清单</strong>
        <Badge tone={open.length > 0 ? 'red' : 'green'}>{open.length > 0 ? `${open.length} 待处理` : '已清零'}</Badge>
      </div>
      <p className="panel-hint">任一版本变化后两份签署已同时失效；处理期间发布包不能生成。逐项处理清零后两人重新确认。</p>
      <div className="invalidation-list">
        {session.invalidations.map((item) => (
          <div key={item.id} className={`invalidation-row ${item.resolved ? 'resolved' : ''}`}>
            <Badge tone={item.kind === 'page-order' ? 'red' : item.kind === 'metadata' ? 'amber' : 'blue'}>
              {item.kind === 'page-order' ? '页序' : item.kind === 'metadata' ? '元数据' : '区域'}
            </Badge>
            <div><strong>{item.label}</strong><span>{item.detail} · 检出 {item.detectedAt}</span></div>
            {item.resolved ? <Badge tone="green"><Check size={12} /> 已处理</Badge> : (
              <Button variant="outline" onClick={() => store.resolveInvalidation(documentId, item.id)}><Check size={14} /> 处理并清零</Button>
            )}
          </div>
        ))}
      </div>
      {open.length === 0 && session.status !== 'sealed' && (
        <div className="reconfirm-note"><RefreshCw size={15} /><span>冻结基线已刷新，两名质控员需按新基线重新递交签署。</span></div>
      )}
    </Card>
  );
}

function ReviewerPanel({ documentId, session, reviewer }: { documentId: string; session: ReviewSession; reviewer: string }) {
  const store = useDisclosureStore();
  const drafts = useDisclosureStore((state) => state.reviewDrafts[documentId]?.[reviewer]);
  const [requestId, setRequestId] = useState('');
  const signature = session.signatures.filter((item) => item.reviewer === reviewer).slice(-1)[0];
  const activeSignature = session.signatures.find((item) => item.reviewer === reviewer && item.active && item.round === session.round);
  const locked = session.invalidations.some((item) => !item.resolved);
  const draft = drafts;

  if (!draft) {
    return (
      <Card className="reviewer-card">
        <div className="card-title"><PenLine size={17} /><strong>{reviewer} 的复核结论</strong></div>
        <p className="muted">发起双人复核后自动生成结论草稿。</p>
      </Card>
    );
  }

  const submit = () => {
    const id = requestId.trim() || undefined;
    if (id) setRequestId('');
    store.submitSignature(documentId, reviewer, id);
  };

  return (
    <Card className={`reviewer-card ${activeSignature ? 'signed' : ''}`}>
      <div className="card-title">
        <PenLine size={17} />
        <strong>{reviewer} 的复核结论</strong>
        {activeSignature
          ? <Badge tone="green"><Check size={12} /> 已签署 {activeSignature.signedAt}</Badge>
          : signature && !signature.active
            ? <Badge tone="red">签署已失效</Badge>
            : <Badge tone="amber">草稿</Badge>}
      </div>

      <div className="draft-block">
        <small>发布前校验项</small>
        {REVIEW_CHECK_ITEMS.map((check) => (
          <label key={check.id} className="check-inline">
            <input
              type="checkbox"
              checked={draft.checks[check.id] ?? false}
              disabled={Boolean(activeSignature) || locked}
              onChange={() => store.updateDraft(documentId, reviewer, { checks: { ...draft.checks, [check.id]: !draft.checks[check.id] } })}
            />
            <span>{check.label}</span>
          </label>
        ))}
      </div>

      <div className="draft-block">
        <small>冻结基线三一致结论</small>
        <label className="choice-row"><span>页序与页码</span>
          <select value={draft.pageOrderChoice} disabled={Boolean(activeSignature) || locked} onChange={(event) => store.updateDraft(documentId, reviewer, { pageOrderChoice: event.target.value as '一致' | '异常' })}>
            <option>一致</option><option>异常</option>
          </select>
        </label>
        <label className="choice-row"><span>元数据清理</span>
          <select value={draft.metadataChoice} disabled={Boolean(activeSignature) || locked} onChange={(event) => store.updateDraft(documentId, reviewer, { metadataChoice: event.target.value as '已清理' | '有残留' })}>
            <option>已清理</option><option>有残留</option>
          </select>
        </label>
        <div className="region-choices">
          {session.frozen.regions.map((region) => (
            <label key={region.id} className="choice-row">
              <span>区域 {region.id}（第 {region.page} 页 · v{region.version}）</span>
              <select
                value={draft.regionChoices[region.id] ?? '一致'}
                disabled={Boolean(activeSignature) || locked}
                onChange={(event) => store.setRegionChoice(documentId, reviewer, region.id, event.target.value as '一致' | '有异议')}
              >
                <option>一致</option><option>有异议</option>
              </select>
            </label>
          ))}
        </div>
      </div>

      {session.conflictNotice?.reviewer === reviewer && (
        <div className="conflict-banner">
          <Zap size={15} />
          <div>
            <strong>并发递交冲突</strong>
            <span>您的请求 {session.conflictNotice.requestId} 晚于 {session.conflictNotice.againstRequestId}，系统只接收先到版本；您的结论已保留为草稿。</span>
          </div>
        </div>
      )}

      {signature && !activeSignature && signature.invalidatedReason && (
        <div className="invalid-sign-note"><AlertTriangle size={15} /><span>原签署 {signature.id}：{signature.invalidatedReason}</span></div>
      )}

      <div className="submit-row">
        <input
          placeholder="凭原请求号恢复（留空生成新请求号）"
          value={requestId}
          disabled={Boolean(activeSignature)}
          onChange={(event) => setRequestId(event.target.value)}
        />
        <Button onClick={submit} disabled={Boolean(activeSignature) || locked}>
          <RotateCcw size={14} /> {requestId.trim() ? '恢复/重试递交' : signature && !activeSignature ? '重新确认签署' : '递交签署'}
        </Button>
      </div>
      {activeSignature && <p className="muted tiny">请求号 {activeSignature.requestId} · {activeSignature.reSign ? '重新确认签署' : '首次签署'} · 重试同一请求号将幂等返回本结果</p>}
    </Card>
  );
}

function AuditTrail({ session }: { session: ReviewSession }) {
  return (
    <Card className="audit-trail-card">
      <div className="card-title"><History size={17} /><strong>追溯记录</strong><Badge tone="neutral">{session.audit.length} 条</Badge></div>
      <div className="audit-trail">
        {session.audit.map((event, index) => (
          <p key={`${event.at}-${index}`} className={event.tone}><b>{event.at}</b> {event.text}</p>
        ))}
      </div>
    </Card>
  );
}

function QualityPage() {
  const { documents, qualityDocumentId, activeReviewer, sessions, simulateWriteFailure, lastSubmit, releasePackages } = useDisclosureStore();
  const store = useDisclosureStore();
  const doc = documents.find((item) => item.id === qualityDocumentId) ?? documents[1];
  const session = sessions.find((item) => item.documentId === doc.id);
  const [sealMessage, setSealMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const activeCount = session ? session.signatures.filter((signature) => signature.active).length : 0;

  const seal = () => {
    const result = store.sealDocument(doc.id);
    setSealMessage({ ok: result.ok, text: result.message });
  };

  return (
    <div className="page quality-page-v2">
      <header className="page-heading">
        <div><small>QUALITY ASSURANCE / TRACEABLE DUAL REVIEW</small><h1>发布质控双人复核 · 可追溯发布批次</h1><p>发起即冻结；页序、元数据或任一区域版本变化，两份签署同时失效并登记受影响对象；清零重签、三一致后方可封印进批次。</p></div>
        <div className="quality-header-actions">
          <label className={`failure-switch ${simulateWriteFailure ? 'on' : ''}`}>
            <input type="checkbox" checked={simulateWriteFailure} onChange={store.toggleFailureSimulation} />
            <Zap size={14} /> 模拟写入失败（断点续传演练）
          </label>
        </div>
      </header>

      <Card className="doc-selector-card">
        <div className="doc-selector">
          {documents.map((item) => {
            const itemSession = sessions.find((sessionItem) => sessionItem.documentId === item.id);
            return (
              <button
                key={item.id}
                className={item.id === doc.id ? 'active' : ''}
                onClick={() => { store.selectQualityDocument(item.id); setSealMessage(null); }}
              >
                <FileText size={16} />
                <div><strong>{item.title}</strong><span>{item.id} · {item.bundle}</span></div>
                {itemSession
                  ? <Badge tone={statusMeta[itemSession.status].tone}>{statusMeta[itemSession.status].label}</Badge>
                  : <Badge tone="neutral">未发起</Badge>}
              </button>
            );
          })}
        </div>
        <div className="start-row">
          <div className="reviewer-switch">
            <Users size={15} />
            {REVIEWERS.map((reviewer) => (
              <button key={reviewer} className={activeReviewer === reviewer ? 'active' : ''} onClick={() => store.setActiveReviewer(reviewer)}>
                <UserCheck size={13} /> {reviewer}{activeReviewer === reviewer ? '（当前操作）' : ''}
              </button>
            ))}
          </div>
          <Button onClick={() => store.startReview(doc.id)}>
            <Snowflake size={15} /> {session ? '重新发起并冻结' : '发起双人复核（冻结快照）'}
          </Button>
        </div>
      </Card>

      {lastSubmit && (
        <div className={`submit-outcome ${lastSubmit.ok ? 'ok' : lastSubmit.stage}`}>
          {lastSubmit.ok ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{lastSubmit.message}</span>
          <button onClick={store.clearLastSubmit} aria-label="关闭"><X size={14} /></button>
        </div>
      )}

      {!session ? (
        <Card className="empty-session">
          <ScanSearch size={26} />
          <strong>尚未发起双人复核</strong>
          <p>发起时将冻结原始页、发布页、去密区域与两名质控员的复核结论，作为整套签署与发布批次的追溯基线。</p>
          <Button onClick={() => store.startReview(doc.id)}><Snowflake size={15} /> 发起双人复核</Button>
        </Card>
      ) : (
        <>
          <div className="comparison-banner">
            <div><Eye size={17} /><strong>{doc.title}</strong><span>第 {session.round} 轮 · 冻结 {session.frozen.frozenAt}{session.frozen.refrozenAt ? ` / 刷新 ${session.frozen.refrozenAt}` : ''} · 页序 v{session.frozen.pageOrderVersion} · 元数据 v{session.frozen.metadataVersion} · 区域合计 v{session.frozen.regionSetVersion}</span></div>
            <Badge tone={statusMeta[session.status].tone}>{statusMeta[session.status].label} · 签署 {activeCount}/2</Badge>
          </div>

          <div className="drift-simulator">
            <span><Zap size={14} /> 流程演练</span>
            <div className="drift-actions">
              <Button variant="outline" onClick={() => store.submitSimultaneous(doc.id)} disabled={!session || activeCount > 0 || session.invalidations.some((item) => !item.resolved)}><Users size={14} /> 两人同时递交（冲突裁决）</Button>
              <Button variant="outline" onClick={() => store.simulateDrift(doc.id, 'page-order')}><RefreshCw size={14} /> 交换前两页（页序 +1）</Button>
              <Button variant="outline" onClick={() => store.simulateDrift(doc.id, 'metadata')}><RefreshCw size={14} /> 改写元数据（版本 +1）</Button>
              <Button variant="outline" onClick={() => store.simulateDrift(doc.id, 'region')}><RefreshCw size={14} /> 补改首个区域（版本 +1）</Button>
            </div>
          </div>

          {session.baselineStale && (
            <div className="submit-outcome drift">
              <AlertTriangle size={16} />
              <span>初签前页序/元数据/区域已发生变化，冻结基线已过期；刷新冻结后即可继续签署（尚无论签署，不登记失效项）。</span>
              <Button variant="outline" onClick={() => store.refreshFreeze(doc.id)}><Snowflake size={14} /> 刷新冻结</Button>
            </div>
          )}

          <div className="quality-grid">
            <div className="quality-main-col">
              <div className="compare-grid">
                <Card className="compare-panel"><div className="compare-head"><span>原始页（冻结）</span><Badge tone="neutral">源文件指纹</Badge></div><div className="compare-page"><PdfPage pageNumber={session.frozen.pages[0]?.page ?? 1} /></div></Card>
                <Card className="compare-panel"><div className="compare-head"><span>发布页（冻结）</span><Badge tone="green">已遮蔽指纹</Badge></div><div className="compare-page redacted-preview"><PdfPage pageNumber={session.frozen.pages[0]?.page ?? 1} redacted /><div className="demo-mask mask-one" /><div className="demo-mask mask-two" /></div></Card>
              </div>
              <InvalidationPanel documentId={doc.id} session={session} />
            </div>
            <div className="quality-side-col">
              <FrozenPanel session={session} doc={doc} />
            </div>
          </div>

          <div className="reviewer-grid">
            {REVIEWERS.map((reviewer) => (
              <div key={reviewer} className={activeReviewer === reviewer ? 'reviewer-slot active-slot' : 'reviewer-slot'}>
                <ReviewerPanel documentId={doc.id} session={session} reviewer={reviewer} />
              </div>
            ))}
          </div>

          <Card className="seal-card">
            <div className="card-title"><Stamp size={17} /><strong>发布批次门禁</strong></div>
            <div className="seal-gate">
              <GateStep label="失效项全部清零" pass={session.invalidations.every((item) => item.resolved)} />
              <GateStep label="两名质控员重新签署 2/2" pass={activeCount === 2} />
              <GateStep
                label="页序结论一致"
                pass={activeCount === 2 && (() => {
                  const actives = session.signatures.filter((sig) => sig.active && sig.round === session.round);
                  return actives.length === 2 && actives[0].payload.pageOrderChoice === actives[1].payload.pageOrderChoice && actives[0].payload.pageOrderVersion === actives[1].payload.pageOrderVersion;
                })()}
              />
              <GateStep
                label="元数据结论一致"
                pass={activeCount === 2 && (() => {
                  const actives = session.signatures.filter((sig) => sig.active && sig.round === session.round);
                  return actives.length === 2 && actives[0].payload.metadataChoice === actives[1].payload.metadataChoice && actives[0].payload.metadataVersion === actives[1].payload.metadataVersion;
                })()}
              />
              <GateStep
                label="各区域结论一致"
                pass={activeCount === 2 && (() => {
                  const actives = session.signatures.filter((sig) => sig.active && sig.round === session.round);
                  return actives.length === 2 && JSON.stringify(actives[0].payload.regionChoices) === JSON.stringify(actives[1].payload.regionChoices) && actives[0].payload.regionSetVersion === actives[1].payload.regionSetVersion;
                })()}
              />
            </div>
            <div className="seal-actions">
              <Button onClick={seal} disabled={session.status === 'sealed'}>
                <PackageCheck size={15} /> {session.status === 'sealed' ? '已封印，可进入发布批次' : '封印并进入发布批次'}
              </Button>
              {sealMessage && <span className={`seal-message ${sealMessage.ok ? 'ok' : 'fail'}`}>{sealMessage.ok ? <Check size={13} /> : <AlertTriangle size={13} />}{sealMessage.text}</span>}
            </div>
          </Card>

          <AuditTrail session={session} />
        </>
      )}

      {releasePackages.length > 0 && (
        <Card className="packages-card">
          <div className="card-title"><PackageCheck size={17} /><strong>已生成发布包</strong></div>
          {releasePackages.map((pkg) => (
            <div key={pkg.id} className="package-row">
              <Badge tone="green">{pkg.id}</Badge>
              <strong>{pkg.batchName}</strong>
              <span>{pkg.createdAt} · {pkg.documentIds.length} 份</span>
              <div className="package-traces">
                {pkg.traces.map((trace) => (
                  <code key={trace.documentId}>{trace.documentId}：冻结 {trace.frozenAt} → 封印 {trace.sealedAt}；{trace.signatures.map((s) => `${s.reviewer}(${s.requestId})`).join(' / ')}</code>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function GateStep({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className={`gate-step ${pass ? 'pass' : 'fail'}`}>
      {pass ? <Check size={14} /> : <AlertTriangle size={14} />}
      <span>{label}</span>
    </div>
  );
}

function BatchesPage() {
  const { documents, sessions, releasePackages } = useDisclosureStore();
  const store = useDisclosureStore();
  const [selected, setSelected] = useState<string[]>(documents.filter((doc) => sessions.find((session) => session.documentId === doc.id && session.status === 'sealed')).map((doc) => doc.id));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const gateOf = (id: string) => {
    const session = sessions.find((item) => item.documentId === id);
    if (!session) return { pass: false, reason: '未完成双人复核' };
    const open = session.invalidations.filter((item) => !item.resolved).length;
    if (open > 0) return { pass: false, reason: `${open} 项失效处理中，发布包冻结` };
    if (session.status !== 'sealed') return { pass: false, reason: '复核未封印' };
    return { pass: true, reason: '双签封印，追溯链完整' };
  };

  const generate = () => {
    const result = store.generateReleasePackage(selected, '第三批披露');
    setMessage({ ok: result.ok, text: result.ok ? `发布包 ${result.pkg?.id} 已生成，含 ${selected.length} 份封印文档` : result.message ?? '发布包不能生成' });
  };

  return (
    <div className="page">
      <header className="page-heading"><div><small>RELEASE BATCH / TAXONOMY</small><h1>发布批次与标签</h1><p>仅双人复核封印、追溯链完整的文档可进入发布包；处理期间的文档一律拦截。</p></div>
        <Button onClick={generate}><PackageCheck size={16} /> 生成发布包</Button>
      </header>
      {message && <div className={`submit-outcome ${message.ok ? 'ok' : 'drift'}`}>{message.ok ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{message.text}</span></div>}
      <div className="batch-layout">
        <Card className="batch-list"><div className="card-title"><Layers3 size={17} /><strong>发布批次</strong></div>{['第一批披露 · 审阅中', '第二批披露 · 编制中', '专家材料 · 待补充'].map((name, index) => <button key={name} className={index === 0 ? 'active' : ''}><span>BATCH-{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><small>{[48, 79, 19][index]} 份文档</small></button>)}</Card>
        <Card className="batch-content">
          <div className="card-title"><Tags size={17} /><strong>文档与案件问题映射</strong><span>{selected.length} 已选择</span></div>
          <div className="batch-table">
            {documents.map((doc) => {
              const gate = gateOf(doc.id);
              const session = sessions.find((item) => item.documentId === doc.id);
              return (
                <label key={doc.id} className={`batch-row ${gate.pass ? '' : 'blocked'}`}>
                  <input type="checkbox" checked={selected.includes(doc.id)} disabled={!gate.pass} onChange={() => setSelected((ids) => ids.includes(doc.id) ? ids.filter((id) => id !== doc.id) : [...ids, doc.id])} />
                  <FileText size={17} />
                  <div><strong>{doc.title}</strong><span>{doc.id} · {doc.issue}{session ? ` · 签署 ${session.signatures.filter((s) => s.active).length}/2` : ''}</span></div>
                  <Badge tone={gate.pass ? 'green' : session?.status === 'invalidated' ? 'red' : 'amber'}>{gate.pass ? '可入包' : gate.reason}</Badge>
                </label>
              );
            })}
          </div>
          <div className="tag-editor"><h3>标签与分发级</h3><div className="tag-options">{(['合同问题', '设备缺陷', '现场安全', '损害赔偿', '仅律师可见']).map((tag, index) => <span key={tag} className={index < 3 ? 'selected' : ''}>{tag}</span>)}</div><label>导出清单说明<textarea defaultValue="按案卷编号升序导出，保留冻结快照、双方请求号、操作者与封印时间。" /></label></div>
        </Card>
        <Card className="batch-summary">
          <div className="side-label">当前批次摘要</div>
          <strong>第三批披露</strong>
          <dl>
            <div><dt>已选文档</dt><dd>{selected.length}</dd></div>
            <div><dt>封印页数</dt><dd>{selected.reduce((sum, id) => sum + (documents.find((doc) => doc.id === id)?.pages ?? 0), 0)}</dd></div>
            <div><dt>追溯签署</dt><dd>{selected.reduce((sum, id) => sum + (sessions.find((session) => session.documentId === id)?.signatures.filter((s) => s.active).length ?? 0), 0)}</dd></div>
          </dl>
          {releasePackages[0] && <div className="summary-note package-ok"><PackageCheck size={15} /><span>最新发布包 {releasePackages[0].id} · {releasePackages[0].createdAt}</span></div>}
          {!releasePackages[0] && <div className="summary-note"><AlertTriangle size={15} /><span>含未封印或处理中文档时，发布包不能生成。</span></div>}
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
