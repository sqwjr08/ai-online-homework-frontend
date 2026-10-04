import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewModel, comparisonRows, teacherSubmission, aiStatus, reviewStatus, aiError } from '../src/assignments/review.js';
const assignment = { id: 'a', view: 'teacher', question_source: 'snapshot', questions: [{ question_id: 'q' }] };
const submission = { id: 's', assignment_id: 'a', view: 'teacher', status: 'pending_teacher_review', ai_status: 'failed', answers: [{ question_id: 'q', answer_text: '原文', ai_score: 0, final_score: 0 }], ai_total_score: 0, final_total_score: 0 };
const progress = { submitted_count: 30, pending_count: 28, confirmed_count: 2 };
const page = (params, items = [submission]) => ({ items, total: 2, page: params.page, page_size: params.page_size, progress });
test('GET-only pagination passes human filter and keeps global progress and zero scores', async () => {
  const calls = []; const model = createReviewModel({ get: async (url, { params }) => {
    calls.push([url, params]); return url === '/assignments/a' ? assignment : url === '/submissions/s' ? submission : page(params);
  } });
  await model.select('a'); model.state.filter = 'confirmed'; model.state.pageSize = 50; await model.load(2);
  assert.deepEqual(calls.at(-1), ['/assignments/a/submissions', { page: 2, page_size: 50, status: 'confirmed' }]);
  assert.equal(model.state.total, 2); assert.deepEqual(model.state.progress, progress);
  await model.read('s'); assert.equal(model.state.detail.ai_total_score, 0); assert.equal(model.state.detail.final_total_score, 0);
  assert.equal(model.state.detail.status, 'pending_teacher_review'); assert.equal(model.state.detail.ai_status, 'failed');
});
test('missing snapshot does not block independent list/detail or fetch current question bank', async () => {
  const calls = []; const model = createReviewModel({ get: async (url, { params }) => {
    calls.push(url); if (url === '/assignments/a') throw { status: 409, message: '快照损坏' };
    return url === '/submissions/s' ? submission : page(params);
  } });
  await model.select('a'); await model.read('s'); assert.equal(model.state.assignment, null); assert.equal(model.state.assignmentError, '快照损坏');
  assert.equal(model.state.items.length, 1); assert.equal(model.state.detail.id, 's');
  assert.equal(comparisonRows(null, model.state.detail).unmatched.length, 1); assert.ok(calls.every(url => !url.startsWith('/questions')));
});
test('answer comparison uses IDs and exposes missing, duplicate and orphan records', () => {
  const q = { questions: [{ question_id: 'a' }, { question_id: 'b' }, { question_id: 'missing' }] };
  const result = comparisonRows(q, { answers: [{ question_id: 'b', answer_text: 'B' }, { question_id: 'a', answer_text: 'A' }, { question_id: 'orphan' }] });
  assert.equal(result.rows[0].answer.answer_text, 'A'); assert.equal(result.rows[1].answer.answer_text, 'B');
  assert.equal(result.rows[2].mismatch, true); assert.equal(result.unmatched[0].question_id, 'orphan');
  const duplicate = comparisonRows({ questions: [{ question_id: 'a' }, { question_id: 'a' }] }, { answers: [{ question_id: 'a' }] });
  assert.ok(duplicate.rows.every(row => row.mismatch)); assert.equal(duplicate.unmatched.length, 1);
  const duplicateAnswer = comparisonRows(q, { answers: [{ question_id: 'a' }, { question_id: 'a' }] });
  assert.equal(duplicateAnswer.rows[0].answer, null); assert.equal(duplicateAnswer.unmatched.length, 2);
});
test('teacher scope rejects student view, wrong assignment and wrong submission ID', async () => {
  assert.throws(() => teacherSubmission({ ...submission, view: 'student' }, 'a'));
  assert.throws(() => teacherSubmission(submission, 'other'));
  let data = assignment;
  const model = createReviewModel({ get: async (url, { params }) => url === '/assignments/a' ? assignment : url.includes('/assignments/') ? page(params) : data });
  await model.select('a'); await model.read('s'); assert.equal(model.state.detail, null); assert.ok(model.state.detailError);
  data = { ...submission, view: 'student' }; await model.read('s'); assert.equal(model.state.detail, null);
});
test('failed refreshes remove stale list, progress and detail for 403/404/409', async () => {
  let failure = null; const model = createReviewModel({ get: async (url, { params }) => {
    if (failure) throw failure;
    return url === '/assignments/a' ? assignment : url === '/submissions/s' ? submission : page(params);
  } });
  for (const status of [403, 404, 409]) {
    failure = null; await model.select('a'); await model.read('s'); failure = { status, message: '拒绝读取' };
    await model.read('s'); assert.equal(model.state.detail, null); assert.equal(model.state.detailError, '拒绝读取');
    await model.load(); assert.deepEqual(model.state.items, []); assert.equal(model.state.progress, null); assert.equal(model.state.selectedId, null);
    await model.loadAssignment(); assert.equal(model.state.assignment, null);
  }
});
test('late list/detail responses cannot overwrite newer selection or repopulate disposed state', async () => {
  const queue = []; const model = createReviewModel({ get: (url, options) => new Promise(resolve => queue.push({ url, options, resolve })) });
  const first = model.select('a'); const second = model.select('b');
  queue[2].resolve({ ...assignment, id: 'b' }); queue[3].resolve(page({ page: 1, page_size: 20 }, [])); await second;
  queue[0].resolve(assignment); queue[1].resolve(page({ page: 1, page_size: 20 })); await first;
  assert.equal(model.state.assignment.id, 'b'); assert.deepEqual(model.state.items, []); assert.equal(queue[0].options.signal.aborted, true);
  const d1 = model.read('s1'); const d2 = model.read('s2');
  queue[5].resolve({ ...submission, assignment_id: 'b', id: 's2' }); await d2;
  queue[4].resolve({ ...submission, assignment_id: 'b', id: 's1' }); await d1; assert.equal(model.state.detail.id, 's2');
  const last = model.read('s3'); model.dispose(); queue[6].resolve({ ...submission, assignment_id: 'b', id: 's3' }); await last;
  assert.equal(model.state.detail, null); assert.equal(model.state.assignment, null);
});
test('all AI states remain distinct from human confirmation; unknown errors do not expose provider text', () => {
  const names = ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'legacy_unknown'].map(aiStatus);
  assert.equal(new Set(names).size, 6); assert.ok(names.every(name => !name.includes('成绩已确认')));
  assert.equal(reviewStatus('confirmed'), '成绩已确认'); assert.ok(!aiError('sensitive provider body').includes('sensitive'));
});
