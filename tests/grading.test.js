import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeable, gradeInput, createGrading } from '../src/assignments/grading.js';
const assignment = { id: 'a', view: 'teacher', status: 'published', question_source: 'snapshot', questions: [{ question_id: 'q', max_score: 10 }, { question_id: 'r', max_score: 5 }] };
const submission = { id: 's', view: 'teacher', assignment_id: 'a', status: 'pending_teacher_review', ai_status: 'failed', answers: [{ question_id: 'r' }, { question_id: 'q' }] };
const confirmed = { ...submission, status: 'confirmed', final_total_score: 0, answers: submission.answers.map(a => ({ ...a, final_score: 0 })) };
function ready(api, callback) {
  const model = createGrading(api, callback); model.begin(assignment, submission);
  model.state.fields = { q: { score: '0.10', comment: '  评语  ' }, r: { score: '0.20', comment: '' } }; model.state.accepted = true; return model;
}
test('validates decimal precision, blank/negative/nonfinite/over-max scores and Unicode comment length; decimal total and request shape', () => {
  for (const score of ['', ' ', '-1', 'NaN', 'Infinity', '10.01', '1.001', '1e1']) assert.ok(gradeInput(assignment.questions, { q: { score }, r: { score: '0' } }).errors.q);
  const valid = gradeInput(assignment.questions, { q: { score: '0.1', comment: ' 评语 ' }, r: { score: '0.2' } });
  assert.equal(valid.total, 0.3); assert.deepEqual(valid.body, { grades: [{ question_id: 'q', final_score: 0.1, final_comment: '评语' }, { question_id: 'r', final_score: 0.2, final_comment: null }] });
  assert.equal(gradeInput(assignment.questions, { q: { score: '0' }, r: { score: '0' } }).total, 0);
  assert.equal(gradeInput(assignment.questions, { q: { score: '10', comment: '😀'.repeat(1000) }, r: { score: '5' } }).total, 15);
  assert.ok(gradeInput(assignment.questions, { q: { score: '1', comment: '😀'.repeat(1001) } }).errors.q);
});
test('eligibility depends on publication and complete matching content, never AI success', () => {
  for (const ai_status of ['pending', 'processing', 'failed', 'cancelled', 'legacy_unknown', 'succeeded']) assert.equal(gradeable(assignment, { ...submission, ai_status }), true);
  assert.equal(gradeable({ ...assignment, status: 'archived' }, submission), true);
  for (const a of [null, { ...assignment, status: 'draft' }, { ...assignment, question_source: 'draft_preview' }, { ...assignment, id: 'other' }, { ...assignment, questions: [] }]) assert.equal(gradeable(a, submission), false);
  assert.equal(gradeable(assignment, confirmed), false); assert.equal(gradeable(assignment, { ...submission, answers: [{ question_id: 'q' }] }), false);
});
test('empty initial fields, explicit acceptance, one POST, fixed target, lock to server response', async () => {
  let resolve, calls = 0, observed; const model = ready({ post: (url, body) => { calls++; assert.equal(url, '/submissions/s/confirm-grade'); assert.equal(body.grades[0].question_id, 'q'); return new Promise(done => { resolve = done; }); } }, value => { observed = value; });
  model.state.accepted = false; await model.submit(); assert.equal(calls, 0); model.state.accepted = true;
  const request = model.submit(); await model.submit(); assert.equal(model.cancel(), false); assert.equal(model.begin(assignment, submission), false); assert.equal(calls, 1);
  resolve(confirmed); await request; assert.equal(model.state.locked, true); assert.equal(observed.final_total_score, 0); await model.submit(); assert.equal(calls, 1);
  model.cancel(); model.begin(assignment, submission); assert.equal(model.state.fields.q.score, '');
});
test('409 fetches locked winner and never overwrites it or retries POST', async () => {
  const calls = []; const model = ready({ post: async url => { calls.push(url); throw { status: 409 }; }, get: async url => { calls.push(url); return confirmed; } });
  await model.submit(); assert.equal(model.state.locked, true); assert.equal(model.state.fields.q.score, '0.10');
  assert.deepEqual(calls, ['/submissions/s/confirm-grade', '/submissions/s']); await model.submit(); assert.equal(calls.length, 2);
});
test('409 repair conflict and unknown outcomes require fresh reads and explicit manual unlock', async () => {
  let failure = { status: 409 }, readFail = false, posts = 0;
  const model = ready({ post: async () => { posts++; throw failure; }, get: async url => { if (readFail) throw Error(); return url === '/submissions/s' ? submission : assignment; } });
  await model.submit(); assert.equal(model.state.retryReady, true); assert.equal(model.state.blocked, true); await model.submit(); assert.equal(posts, 1);
  model.allowRetry(); assert.equal(model.state.accepted, false); model.state.accepted = true; failure = { status: 503 }; await model.submit(); assert.equal(model.state.blocked, true);
  readFail = true; await model.check(); model.allowRetry(); assert.equal(model.state.blocked, true);
  readFail = false; await model.check(); assert.equal(model.state.retryReady, true); assert.equal(posts, 2);
});
test('400/403/404 block; 422 retains fields and maps safe validation messages', async () => {
  for (const status of [400, 403, 404, 422]) {
    const model = ready({ post: async () => { throw { status, fieldErrors: [{ path: ['body', 'grades', 0, 'final_score'], message: 'secret' }] }; } });
    await model.submit(); assert.equal(model.state.fields.q.score, '0.10'); assert.equal(model.state.accepted, false);
    assert.equal(model.state.blocked, status !== 422); assert.ok(!JSON.stringify(model.state).includes('secret'));
    if (status === 422) assert.ok(model.state.errors.q);
  }
});
test('mismatched success becomes unknown outcome; leaving ignores late writes and clears grades', async () => {
  const bad = ready({ post: async () => ({ ...confirmed, id: 'wrong' }) }); await bad.submit(); assert.equal(bad.state.locked, false); assert.equal(bad.state.blocked, true);
  let resolve, callbacks = 0; const model = ready({ post: () => new Promise(done => { resolve = done; }) }, () => callbacks++);
  const pending = model.submit(); model.dispose(); resolve(confirmed); await pending; assert.equal(callbacks, 0); assert.deepEqual(model.state.fields, {});
});
test('recovery with changed or damaged questions preserves inputs but cannot unlock confirmation', async () => {
  const changed = { ...assignment, questions: [{ question_id: 'new', max_score: 4 }] };
  const model = ready({ post: async () => { throw { status: 409 }; }, get: async url => url === '/submissions/s' ? submission : changed });
  await model.submit(); assert.equal(model.state.retryReady, false); assert.equal(model.state.blocked, true);
  assert.equal(model.state.fields.q.score, '0.10'); assert.equal(model.state.fields.new.score, ''); model.allowRetry(); assert.equal(model.state.blocked, true);
});
