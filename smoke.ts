import { useDisclosureStore } from './src/store';

let pass = 0;
let fail = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const store = useDisclosureStore;
store.setState({ sessions: [], reviewDrafts: {}, requests: [], releasePackages: [], simulateWriteFailure: false });
const docId = 'DOC-00427';

console.log('1) 发起冻结');
store.getState().startReview(docId);
let state = store.getState();
let session = state.sessions.find((s) => s.documentId === docId)!;
check('生成冻结快照（原始页/发布页/区域）', session.frozen.pages.length === 3 && session.frozen.regions.length >= 1);
check('状态 active', session.status === 'active');

console.log('2) 两人顺序签署');
const a1 = store.getState().submitSignature(docId, '林清');
const b1 = store.getState().submitSignature(docId, '周叙');
check('林清签署成功', a1.ok, a1.message);
check('周叙顺序签署成功（非冲突）', b1.ok, b1.message);
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('两份签署生效', session.signatures.filter((s) => s.active).length === 2);
check('进入 reconfirming', session.status === 'reconfirming');

console.log('3) 幂等：同一请求号重试沿用首次结果');
const a1Retry = store.getState().submitSignature(docId, '林清', a1.requestId);
check('同请求号幂等返回', a1Retry.ok && a1Retry.resumed, a1Retry.message);
state = store.getState();
check('不新增第三套签署', state.sessions.find((s) => s.documentId === docId)!.signatures.length === 2);

console.log('4) 结论不一致禁止封印');
// 林清改回异议（通过草稿 + 重签路径无法直接改已签，这里用漂移验证更合适；先验证一致可封印）
const sealOK = store.getState().sealDocument(docId);
check('三一致时封印成功', sealOK.ok, sealOK.message);
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('状态 sealed', session.status === 'sealed');
check('文档状态 可发布', state.documents.find((d) => d.id === docId)!.status === '可发布');

console.log('5) 处理期间发布包可以生成（封印态）');
const pkgOK = store.getState().generateReleasePackage([docId], '冒烟批次');
check('封印文档生成发布包', pkgOK.ok, pkgOK.message);

console.log('6) 冻结后漂移：两份签署一起失效 + 受影响对象 + 发布包冻结');
store.getState().simulateDrift(docId, 'page-order');
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('状态 invalidated', session.status === 'invalidated');
check('两份签署全部失效', session.signatures.filter((s) => s.active).length === 0 && session.signatures.length === 2);
check('登记受影响对象（页）', session.invalidations.length >= 1 && session.invalidations.every((i) => i.kind === 'page-order'));
check('文档退回待质检', state.documents.find((d) => d.id === docId)!.status === '待质检');
const pkgBlocked = store.getState().generateReleasePackage([docId], '冒烟批次2');
check('处理期间发布包不能生成', !pkgBlocked.ok && pkgBlocked.message!.includes('发布包冻结'), pkgBlocked.message);

console.log('7) 处理期间不能签署');
const signDuringDrift = store.getState().submitSignature(docId, '林清');
check('签署被阻断', !signDuringDrift.ok && signDuringDrift.stage === 'drift', signDuringDrift.message);

console.log('8) 清零失效项 → 刷新基线 → 重新确认');
const invIds = session.invalidations.map((i) => i.id);
invIds.slice(0, -1).forEach((id) => store.getState().resolveInvalidation(docId, id));
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('未清零完仍为 invalidated', session.status === 'invalidated' && session.invalidations.some((i) => !i.resolved));
store.getState().resolveInvalidation(docId, invIds[invIds.length - 1]);
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('清零后 reconfirming 且基线已刷新', session.status === 'reconfirming' && Boolean(session.frozen.refrozenAt));
check('页序版本对齐新基线', session.frozen.pageOrderVersion === state.documents.find((d) => d.id === docId)!.pageOrderVersion);

console.log('9) 两人重新签署（重签，旧签署保留但失效，不新增两套）');
const a2 = store.getState().submitSignature(docId, '林清');
const b2 = store.getState().submitSignature(docId, '周叙');
check('林清重签成功', a2.ok, a2.message);
check('周叙重签成功', b2.ok, b2.message);
state = store.getState();
session = state.sessions.find((s) => s.documentId === docId)!;
check('生效签署恰好 2 份（历史共 4 份，旧的失效留痕）', session.signatures.filter((s) => s.active).length === 2 && session.signatures.length === 4);
check('新签署标记 reSign', session.signatures.filter((s) => s.active).every((s) => s.reSign));
const seal2 = store.getState().sealDocument(docId);
check('再次封印成功', seal2.ok, seal2.message);

console.log('10) 写入失败断点续传（新文档走一遍）');
const doc2 = 'DOC-00435';
store.getState().startReview(doc2);
store.getState().toggleFailureSimulation();
const failed = store.getState().submitSignature(doc2, '林清');
check('首次写入失败', !failed.ok && failed.stage === 'write-failed' && failed.completedItems === 2, failed.message);
state = store.getState();
const failedReq = state.requests.find((r) => r.requestId === failed.requestId)!;
check('失败请求留痕（2/total）', failedReq.state === 'failed' && failedReq.completedItems === 2);
store.getState().toggleFailureSimulation();
const resumed = store.getState().submitSignature(doc2, '林清', failed.requestId);
check('凭原请求号恢复成功', resumed.ok && resumed.resumed, resumed.message);
state = store.getState();
check('恢复后请求记录唯一且成功', state.requests.filter((r) => r.requestId === failed.requestId).length === 1 && state.requests.find((r) => r.requestId === failed.requestId)!.state === 'succeeded');
check('只产生 1 份签署', state.sessions.find((s) => s.documentId === doc2)!.signatures.length === 1);
const dupRetry = store.getState().submitSignature(doc2, '林清', failed.requestId);
check('再次重复重试幂等', dupRetry.ok && dupRetry.resumed);
check('仍只有 1 份签署', store.getState().sessions.find((s) => s.documentId === doc2)!.signatures.length === 1);

console.log('11) 两人同时递交：只接收先到版本，后到冲突保留草稿');
store.getState().startReview(doc2);
store.setState({ activeReviewer: '林清' });
const { winner, loser } = store.getState().submitSimultaneous(doc2);
check('先到方接收', winner.ok, winner.message);
check('后到方冲突', !loser.ok && loser.stage === 'conflict' && loser.againstRequestId === winner.requestId, loser.message);
state = store.getState();
session = state.sessions.find((s) => s.documentId === doc2)!;
check('只有一份签署（先到）', session.signatures.filter((s) => s.active).length === 1);
check('冲突告示挂在后到者面板', session.conflictNotice?.reviewer === '周叙');
// 后到者看到冲突后刷新，再正常顺序递交（草稿仍在）→ 快乐路径补齐双签
const loserLater = store.getState().submitSignature(doc2, '周叙');
check('后到者刷新后用新请求再递交成功（草稿保留）', loserLater.ok, loserLater.message);

console.log('12) 初签前漂移不阻断，刷新即可');
const doc3 = 'DOC-00418';
store.getState().startReview(doc3);
store.getState().simulateDrift(doc3, 'metadata');
state = store.getState();
session = state.sessions.find((s) => s.documentId === doc3)!;
check('初签前仅标记 baselineStale，无失效项', session.baselineStale && session.invalidations.length === 0);
const blockedStale = store.getState().submitSignature(doc3, '林清');
check('过期基线下提示先刷新', !blockedStale.ok && blockedStale.stage === 'drift');
store.getState().refreshFreeze(doc3);
state = store.getState();
session = state.sessions.find((s) => s.documentId === doc3)!;
check('刷新后 baselineStale 清除且为 active', !session.baselineStale && session.status === 'active');
check('刷新后可签署', store.getState().submitSignature(doc3, '林清').ok);

console.log('13) 区域漂移登记区域对象');
store.getState().simulateDrift(doc3, 'region');
state = store.getState();
session = state.sessions.find((s) => s.documentId === doc3)!;
check('区域漂移被登记且签署失效', session.invalidations.some((i) => i.kind === 'region') && session.signatures.every((s) => !s.active));

console.log('14) 重新确认时区域结论不一致 → 不能封印');
const doc4 = 'DOC-00427';
// 当前 doc4 已 sealed；制造漂移 → 清零 → 林清把某区域结论改为有异议，周叙保持一致
store.getState().simulateDrift(doc4, 'metadata');
state = store.getState();
session = state.sessions.find((s) => s.documentId === doc4)!;
session.invalidations.forEach((i) => store.getState().resolveInvalidation(doc4, i.id));
const firstRegion = store.getState().sessions.find((s) => s.documentId === doc4)!.frozen.regions[0];
store.getState().setRegionChoice(doc4, '林清', firstRegion.id, '有异议');
store.getState().submitSignature(doc4, '林清');
store.getState().submitSignature(doc4, '周叙');
const sealMismatch = store.getState().sealDocument(doc4);
check('区域结论不一致禁止封印', !sealMismatch.ok && sealMismatch.message.includes('不一致'), sealMismatch.message);
// 林清改回一致后封印通过
store.getState().setRegionChoice(doc4, '林清', firstRegion.id, '一致');
// 需要新一轮：先制造一次刷新基线（结论修改发生在签署前不会漂移，直接让林清覆盖签署需重开轮次）
// 结论仅存草稿，而林清已签署 → 重新发起签署轮次：用刷新冻结开启新一轮
store.getState().simulateDrift(doc4, 'metadata');
store.getState().sessions.find((s) => s.documentId === doc4)!.invalidations.forEach((i) => store.getState().resolveInvalidation(doc4, i.id));
store.getState().submitSignature(doc4, '林清');
store.getState().submitSignature(doc4, '周叙');
const sealAligned = store.getState().sealDocument(doc4);
check('改回一致后封印通过', sealAligned.ok, sealAligned.message);
console.log(`\n最终：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
