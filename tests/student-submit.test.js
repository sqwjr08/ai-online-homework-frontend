import test from 'node:test';
import assert from 'node:assert/strict';
import { answerInput, createStudentAssignments } from '../src/student/assignments.js';
const detail = { id: 'a', view: 'student', status: 'published', class_id: 'c', due_at: null, questions: [{ question_id: 'q', prompt: '题', image_urls: [], max_score: 10 }] };
const record = { id: 's', view: 'student', assignment_id: 'a', status: 'pending_teacher_review', submitted_at: '2030-01-01T00:00:00Z', final_total_score: null, answers: [] };
function setup(post) {
  let own = null, group = { id: 'c', is_active: true, name: '虚构班' }, detailError = null;
  const api = { post, get: async url => {
    if (url === '/classes/my') return group ? [group] : [];
    if (url.endsWith('/submissions/my')) { if (!own) throw { status: 404 }; if (own.error) throw own.error; return own; }
    if (detailError) throw detailError;
    return detail;
  } };
  const model = createStudentAssignments(api);
  return { model, setOwn: value => { own = value; }, setGroup: value => { group = value; }, setDetailError: value => { detailError = value; } };
}
async function ready(model) { await model.loadGroup(); await model.open('a'); model.state.answers.q = ' 我的答案\n '; model.state.confirmed = true; }

test('answers preserve raw text, enforce Unicode length and reject whitespace or malformed question sets', () => {
  assert.deepEqual(answerInput(detail, { q: ' 答\n ', extra: '不发送' }).body, { answers: [{ question_id: 'q', answer_text: ' 答\n ' }] });
  assert.ok(answerInput(detail, { q: ' \n ' }).errors.q);
  assert.equal(Object.keys(answerInput(detail, { q: '😀'.repeat(20000) }).errors).length, 0);
  assert.ok(answerInput(detail, { q: '字'.repeat(20001) }).errors.q);
  assert.ok(answerInput({ questions: [] }, {}).errors.form);
  assert.ok(answerInput({ questions: [detail.questions[0], detail.questions[0]] }, { q: '答' }).errors.form);
});
test('requires active matching class, known no submission and explicit confirmation; body contains only text answers', async () => {
  const calls = []; const { model, setGroup } = setup(async (...args) => { calls.push(args); return record; });
  await ready(model); model.state.confirmed = false; await model.submit(); assert.equal(calls.length, 0);
  model.state.confirmed = true; setGroup({ id: 'c', is_active: false }); await model.loadGroup(); assert.equal(model.canSubmit(), false); await model.submit(); assert.equal(calls.length, 0);
  setGroup({ id: 'c', is_active: true }); await model.loadGroup(); assert.equal(await model.submit(), true);
  assert.deepEqual(calls, [['/assignments/a/submissions', { answers: [{ question_id: 'q', answer_text: ' 我的答案\n ' }] }]]);
  assert.equal(model.state.submitted, true); assert.deepEqual(model.state.answers, {}); assert.match(model.state.success, /不代表/); assert.equal('answers' in model.state.submission, false);
  assert.equal(await model.submit(), false);
});
test('duplicate clicks and target switching while write is pending are blocked; leaving ignores late result', async () => {
  let resolve, calls = 0; const { model } = setup(() => { calls++; return new Promise(done => { resolve = done; }); });
  await ready(model); const pending = model.submit(); await model.submit(); await model.open('b'); model.close();
  assert.equal(calls, 1); assert.equal(model.state.selectedId, 'a');
  model.dispose(); resolve(record); assert.equal(await pending, false); assert.equal(model.state.submission, null); assert.deepEqual(model.state.answers, {});
});
test('422 preserves text and safely maps question errors; deadline/permission failures require renewed checks', async () => {
  let failure = { status: 422, fieldErrors: [{ path: ['body', 'answers', 0, 'answer_text'], message: 'raw secret' }] };
  const { model } = setup(async () => { throw failure; }); await ready(model); await model.submit();
  assert.equal(model.state.answers.q, ' 我的答案\n '); assert.ok(model.state.answerErrors.q); assert.ok(!JSON.stringify(model.state).includes('raw secret'));
  for (const status of [400, 403, 404]) {
    failure = { status }; model.state.confirmed = true; await model.submit(); assert.equal(model.state.blocked, true);
    assert.equal(await model.submit(), false); await model.checkBeforeRetry(); model.allowRetry(); assert.equal(model.state.confirmed, false);
  }
});
test('409 queries own submission and stops when found; absent record does not imply duplicate submission', async () => {
  const found = setup(async () => { throw { status: 409 }; }); await ready(found.model); found.setOwn(record); await found.model.submit();
  assert.equal(found.model.state.submitted, true); assert.equal(found.model.canSubmit(), false); assert.match(found.model.state.writeError, /已查到/);
  assert.equal(found.model.state.answers.q, ' 我的答案\n ');
  const missing = setup(async () => { throw { status: 409 }; }); await ready(missing.model); await missing.model.submit();
  assert.equal(missing.model.state.submitted, false); assert.equal(missing.model.state.blocked, true); assert.equal(missing.model.state.answers.q, ' 我的答案\n ');
});
test('unknown outcome never retries automatically; GET failure or invisible assignment cannot unlock sending', async () => {
  let calls = 0; const fixture = setup(async () => { calls++; throw { status: 503 }; }); const { model } = fixture;
  await ready(model); await model.submit(); assert.match(model.state.writeError, /不确定/);
  fixture.setOwn({ error: { status: 503, message: '离线' } }); await model.checkBeforeRetry(); model.allowRetry(); assert.equal(model.state.blocked, true);
  fixture.setOwn(null); fixture.setDetailError({ status: 404 }); await model.checkBeforeRetry(); model.allowRetry(); assert.equal(model.state.blocked, true);
  fixture.setDetailError(null); await model.checkBeforeRetry(); assert.equal(model.state.blocked, true); assert.equal(model.state.retryReady, true);
  model.allowRetry(); assert.equal(model.state.confirmed, false); assert.equal(calls, 1);
  fixture.setOwn(record); await model.readSubmission(); assert.equal(model.canSubmit(), false);
});
