import test from 'node:test';
import assert from 'node:assert/strict';
import { studentResult, resultRows, createStudentResults } from '../src/student/results.js';
const record = { view: 'student', id: 's', assignment_id: 'a', student_id: 'u', status: 'confirmed', submitted_at: '2030-01-01T00:00:00Z',
  final_total_score: 0, reviewed_at: '2030-01-02T00:00:00Z', ai_total_score: 99, reference_answer: 'restricted', ai_status: 'succeeded',
  answers: [{ question_id: 'q', answer_text: ' 原文\n<script>text</script>', final_score: 0, final_comment: '教师评语', ai_score: 99, ai_comment: 'restricted', rubric: 'restricted' }] };
const assignment = { view: 'student', id: 'a', status: 'published', title: '题', reference_answer: 'restricted', questions: [{ question_id: 'q', max_score: 10, prompt: '题干', image_urls: [], rubric: 'restricted', reference_answer: 'restricted' }] };
test('confirmed student projection preserves zero, text and comments, strips all AI/teacher extras', () => {
  const result = studentResult(record, 'u', { submissionId: 's' });
  assert.equal(result.final_total_score, 0); assert.equal(result.answers[0].final_score, 0); assert.equal(result.answers[0].answer_text, record.answers[0].answer_text);
  assert.equal(result.answers[0].final_comment, '教师评语'); assert.ok(!JSON.stringify(result).includes('restricted')); assert.ok(!('ai_total_score' in result));
  const missing = studentResult({ ...record, final_total_score: null, answers: [{ ...record.answers[0], final_score: null }] }, 'u', { assignmentId: 'a' });
  assert.equal(missing.final_total_score, null); assert.equal(missing.answers[0].final_score, null);
});
test('pending response never retains grades, comments or review time even if populated by server', () => {
  const result = studentResult({ ...record, status: 'pending_teacher_review' }, 'u', { assignmentId: 'a' });
  assert.equal(result.final_total_score, null); assert.equal(result.reviewed_at, null); assert.equal(result.answers[0].final_score, null); assert.equal(result.answers[0].final_comment, null);
  assert.ok(!JSON.stringify(result).includes('教师评语'));
});
test('rejects teacher response, other student, mismatched target, unknown status and malformed answers', () => {
  for (const data of [{ ...record, view: 'teacher' }, { ...record, student_id: 'other' }, { ...record, id: 'other' }, { ...record, status: 'unknown' }, { ...record, answers: null }, { ...record, answers: [{}] }]) assert.throws(() => studentResult(data, 'u', { submissionId: 's' }));
  assert.throws(() => studentResult(record, 'u', { assignmentId: 'other' })); assert.throws(() => studentResult(record, null, { submissionId: 's' }));
});
test('both known-ID paths work; archived/inaccessible content does not remove own grades and never fetches teacher endpoints', async () => {
  for (const status of [403, 404, 409, 503]) {
    const calls = []; const model = createStudentResults({ get: async url => {
      calls.push(url); if (url === '/assignments/a') throw { status }; return record;
    } }, () => 'u');
    await model.load({ assignmentId: 'a' }); assert.equal(model.state.result.final_total_score, 0); assert.equal(model.state.assignment, null); assert.ok(model.state.contentError);
    assert.deepEqual(calls, ['/assignments/a/submissions/my', '/assignments/a']);
    await model.load({ submissionId: 's' }); assert.equal(model.state.result.id, 's'); assert.equal(calls[2], '/submissions/s');
  }
});
test('available question content is projected and matched by ID; missing/duplicate content never guessed', async () => {
  const model = createStudentResults({ get: async url => url === '/submissions/s' ? record : assignment }, () => 'u'); await model.load({ submissionId: 's' });
  assert.ok(!JSON.stringify(model.state).includes('restricted')); assert.equal(resultRows(model.state.result, model.state.assignment)[0].question.prompt, '题干');
  const answers = { answers: [{ question_id: 'b' }, { question_id: 'q' }, { question_id: 'orphan' }] };
  const rows = resultRows(answers, { questions: [{ question_id: 'q', prompt: 'Q' }, { question_id: 'b', prompt: 'B' }] });
  assert.equal(rows[0].question.prompt, 'B'); assert.equal(rows[1].question.prompt, 'Q'); assert.equal(rows[2].question, null);
  assert.equal(resultRows({ answers: [{ question_id: 'q' }, { question_id: 'q' }] }, assignment)[0].question, null);
  assert.equal(resultRows(record, { questions: [assignment.questions[0], assignment.questions[0]] })[0].question, null);
  assert.deepEqual(resultRows({ answers: [] }, null), []);
});
test('refresh errors clear prior results and never reveal stale grades after 403/404/422/network error', async () => {
  let failure = null; const model = createStudentResults({ get: async url => { if (failure) throw failure; return url === '/submissions/s' ? record : assignment; } }, () => 'u');
  for (const status of [403, 404, 422, 503]) {
    failure = null; await model.load({ submissionId: 's' }); failure = { status, message: '连接失败' }; await model.load({ submissionId: 's' });
    assert.equal(model.state.result, null); assert.equal(model.state.assignment, null); assert.ok(model.state.error);
  }
});
test('out-of-order reads and unmount cannot show a previous submission or late question response', async () => {
  const requests = []; const model = createStudentResults({ get: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) }, () => 'u');
  const first = model.load({ submissionId: 's' }); const second = model.load({ submissionId: 's2' });
  requests[1].resolve({ ...record, id: 's2' }); await new Promise(resolve => setImmediate(resolve));
  requests[0].resolve(record); await first; assert.equal(model.state.result.id, 's2'); assert.equal(requests[0].options.signal.aborted, true);
  model.dispose(); requests[2].resolve(assignment); await second; assert.equal(model.state.result, null); assert.equal(model.state.assignment, null);
});
test('pending becomes confirmed only after explicit refresh; account change discards responses', async () => {
  let current = { ...record, status: 'pending_teacher_review' }, user = 'u';
  const model = createStudentResults({ get: async url => url === '/submissions/s' ? current : assignment }, () => user);
  await model.load({ submissionId: 's' }); assert.equal(model.state.result.final_total_score, null);
  current = record; await model.load({ submissionId: 's' }); assert.equal(model.state.result.final_total_score, 0);
  let resolve; const changed = createStudentResults({ get: () => new Promise(done => { resolve = done; }) }, () => user);
  const pending = changed.load({ submissionId: 's' }); user = 'other'; resolve(record); await pending; assert.equal(changed.state.result, null); assert.equal(changed.state.loading, false);
});
