// Smoke test for the dual-review ledger. Bundled via esbuild, run with node.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

// Minimal localStorage mock for zustand persist.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

await build({
  entryPoints: ['scripts/test-entry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/reviewStore.bundle.mjs',
  logLevel: 'silent'
});

const { useReviewStore, releaseReadiness, REVIEWERS, useDisclosureStore } = await import('./reviewStore.bundle.mjs');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const s = useReviewStore.getState;
const d = useDisclosureStore.getState;
const U1 = REVIEWERS[0].id, U2 = REVIEWERS[1].id;
const conclusionsFor = (docId) => {
  const rev = s().reviews[docId];
  return { pageOrderOk: true, metadataClean: true, regionIds: rev.snapshot.regions.map((r) => r.id) };
};

// ===== 1. Legacy upgrade + happy path on DOC-00427 =====
s().touchReview('DOC-00427');
let review = s().reviews['DOC-00427'];
check('legacy draft auto-upgraded to schema v1', review.schemaVersion === 1);
check('legacyUpgraded flag set', review.legacyUpgraded === true);
check('snapshot frozen at v1', review.snapshot?.snapshotVersion === 1);
check('not ready before signatures', releaseReadiness(review).ready === false);

s().signReview({ documentId: 'DOC-00427', requestNo: 'REQ-001', reviewerId: U1, conclusions: conclusionsFor('DOC-00427'), snapshotVersion: 1 });
s().signReview({ documentId: 'DOC-00427', requestNo: 'REQ-002', reviewerId: U2, conclusions: conclusionsFor('DOC-00427'), snapshotVersion: 1 });
review = s().reviews['DOC-00427'];
check('two signatures present', review.signatures.length === 2);
check('ready to enter release batch', releaseReadiness(review).ready === true);

// ===== 2. Conflict: later submission with different conclusions is rejected, draft kept =====
const conflictRes = s().signReview({ documentId: 'DOC-00427', requestNo: 'REQ-003', reviewerId: U2, conclusions: { ...conclusionsFor('DOC-00427'), metadataClean: false }, snapshotVersion: 1 });
check('conflict rejected (conclusion mismatch)', conflictRes.conflict === true);
check('conflict draft kept', s().reviews['DOC-00427'].conflictDraft !== null);
check('still only two signatures', s().reviews['DOC-00427'].signatures.length === 2);

// ===== 3. Idempotency: retry committed requestNo reuses first result, no new signature =====
const retryRes = s().signReview({ documentId: 'DOC-00427', requestNo: 'REQ-001', reviewerId: U1, conclusions: conclusionsFor('DOC-00427'), snapshotVersion: 1 });
check('idempotent retry reuses result', retryRes.ok === true && retryRes.reused === true);
check('still only two signatures after retry', s().reviews['DOC-00427'].signatures.length === 2);

// ===== 4. Write failure + recovery by original request number (fresh doc DOC-00435) =====
s().touchReview('DOC-00435');
s().setFaultInjection(true);
const failRes = s().signReview({ documentId: 'DOC-00435', requestNo: 'REQ-010', reviewerId: U1, conclusions: conclusionsFor('DOC-00435'), snapshotVersion: 1, simulateFailure: true });
check('simulated write fails', failRes.ok === false);
let w = s().writes['REQ-010'];
check('write marked failed', w.status === 'failed');
check('last completed step is sign', w.lastCompletedStep === 'sign');
check('signature written but not finalized', s().reviews['DOC-00435'].signatures.some((sig) => sig.requestNo === 'REQ-010'));
s().setFaultInjection(false);
const recoverRes = s().retryWrite('REQ-010');
check('retry by original request number recovers', recoverRes.ok === true && recoverRes.reused === true);
w = s().writes['REQ-010'];
check('write committed after retry', w.status === 'committed');
check('no duplicate signature for REQ-010', s().reviews['DOC-00435'].signatures.filter((sig) => sig.requestNo === 'REQ-010').length === 1);

// ===== 5. Invalidation: region version change invalidates both signatures, blocks release =====
// Bump R-05 version via the document store (simulates re-confirming a region after signing).
d().confirmRedaction('R-05');
s().reconcile('DOC-00435');
review = s().reviews['DOC-00435'];
check('release blocked after region change', review.releaseBlocked === true);
check('both signatures invalidated (moved to history)', review.signatures.length === 0 && review.signatureHistory.length >= 1);
check('affected object listed (region R-05)', review.invalidations.some((i) => i.kind === 'region' && i.targetId === 'R-05' && !i.resolved));
check('not ready while blocked', releaseReadiness(review).ready === false);

// ===== 6. Clear invalidation -> refreeze -> re-sign -> ready again =====
for (const inv of review.invalidations.filter((i) => !i.resolved)) s().resolveInvalidation('DOC-00435', inv.id);
s().refreeze('DOC-00435', '测试操作员');
review = s().reviews['DOC-00435'];
check('refreeze bumps snapshot version', review.snapshot.snapshotVersion === 2);
check('signatures cleared after refreeze', review.signatures.length === 0);
check('round incremented', review.round === 2);
const c2 = conclusionsFor('DOC-00435');
s().signReview({ documentId: 'DOC-00435', requestNo: 'REQ-011', reviewerId: U1, conclusions: { ...c2 }, snapshotVersion: 2 });
s().signReview({ documentId: 'DOC-00435', requestNo: 'REQ-012', reviewerId: U2, conclusions: { ...c2 }, snapshotVersion: 2 });
review = s().reviews['DOC-00435'];
check('ready again after re-confirmation', releaseReadiness(review).ready === true);
check('both signatures on snapshot v2', review.signatures.every((sig) => sig.snapshotVersion === 2));
check('conclusions consistent', review.signatures[0].conclusionsHash === review.signatures[1].conclusionsHash);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
