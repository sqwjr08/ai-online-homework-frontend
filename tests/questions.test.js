import test from 'node:test';
import assert from 'node:assert/strict';
import { questionInput, createQuestionsModel } from '../src/questions/questions.js';
import { ApiError } from '../src/api/errors.js';
import { authorizeRoute } from '../src/auth/guard.js';
const form = { prompt: '  请解释索引\n及其用途。 ', reference_answer: ' 加速检索。 ', max_score: '2.5', rubric: '' };
const question = { id: 'question-a', ...questionInput(form).body, is_active: true };

test('text normalization and finite positive scores, optional rubric and backend length boundaries', () => {
  assert.deepEqual(questionInput(form), { body: { prompt: '请解释索引\n及其用途。', reference_answer: '加速检索。', max_score: 2.5, rubric: null, image_urls: [] }, errors: {} });
  for (const value of ['', '0', '-1', 'NaN', 'Infinity', '1e999']) assert.ok(questionInput({ ...form, max_score: value }).errors.max_score);
  for (const [field, limit] of [['prompt', 10000], ['reference_answer', 20000], ['rubric', 5000]]) {
    assert.ok(questionInput({ ...form, [field]: '  ' }).errors[field]);
    assert.ok(questionInput({ ...form, [field]: '字'.repeat(limit + 1) }).errors[field]);
    assert.equal(questionInput({ ...form, [field]: '字'.repeat(limit) }).errors[field], undefined);
  }
});

test('pagination and literal search preserve false filter; obsolete list and detail responses are ignored', async () => {
  const calls = [];
  const model = createQuestionsModel({ get: (url, config) => new Promise(resolve => calls.push({ url, config, resolve })) });
  const first = model.load(); model.state.q = ' .* '; model.state.active = false; const second = model.load(2);
  assert.deepEqual(calls[1].config.params, { page: 2, page_size: 20, is_active: false, q: '.*' });
  calls[1].resolve({ items: [question], page: 2, page_size: 20, total: 30 }); await second;
  calls[0].resolve({ items: [], page: 1, page_size: 20, total: 0 }); await first;
  assert.equal(model.state.page, 2);
  const a = model.read('a'), b = model.read('b');
  assert.equal(calls[2].config.signal.aborted, true);
  calls[3].resolve({ ...question, id: 'b' }); await b; calls[2].resolve(question); await a;
  assert.equal(model.state.detail.id, 'b');
  model.dispose(); assert.equal(model.state.detail, null); assert.deepEqual(model.state.items, []);
});

test('creation sends exact JSON, prevents duplicate clicks, preserves confirmed success when list refresh fails', async () => {
  let done, writes = 0;
  const model = createQuestionsModel({ post: (url, body) => {
    writes++; assert.equal(url, '/questions'); assert.deepEqual(body, questionInput(form).body);
    return new Promise(resolve => { done = resolve; });
  }, get: async () => { throw new ApiError('offline'); } });
  const pending = model.create(form); assert.equal(await model.create(form), false); done(question);
  assert.equal(await pending, true); assert.equal(writes, 1); assert.match(model.state.success, /question-a/);
  assert.equal(model.state.error, 'offline'); assert.equal(model.state.detail.id, question.id);
});

test('422 maps safe fields, authorization errors are explicit and details do not fall back to stale list data', async () => {
  for (const status of [403, 404, 422]) {
    const fail = async () => { throw new ApiError('request refused', { status, fieldErrors: [{ path: ['body', 'rubric'], message: 'raw private input' }] }); };
    const model = createQuestionsModel({ post: fail, get: fail });
    await model.create(form);
    if (status === 422) assert.match(model.state.errors.rubric, /评分标准/);
    else assert.equal(model.state.createError, 'request refused');
    await model.read(question.id); assert.equal(model.state.detail, null); assert.equal(model.state.detailError, 'request refused');
    assert.equal(JSON.stringify(model.state).includes('raw private input'), false);
  }
});

test('uncertain creation never retries automatically, query failure keeps it blocked and matching text is not proof', async () => {
  let writes = 0, failRead = true;
  const model = createQuestionsModel({ post: async () => { writes++; throw new ApiError('timeout', { kind: 'timeout' }); },
    get: async (url, config) => { assert.equal(config.params.q.length, 200); if (failRead) throw new ApiError('offline'); return { items: [question], total: 1, page: 1, page_size: 20 }; } });
  await model.create(form); await model.create(form); assert.equal(writes, 1);
  await model.checkResult('x'.repeat(250)); assert.equal(model.state.uncertain, true);
  failRead = false; await model.checkResult('x'.repeat(250)); assert.equal(model.state.uncertain, false);
  assert.equal(model.state.success, ''); assert.match(model.state.createError, /不能证明/);
});

test('leaving ignores a late write; student and admin cannot enter this teacher-only question route', async () => {
  let done;
  const model = createQuestionsModel({ post: () => new Promise(resolve => { done = resolve; }) });
  const pending = model.create(form); model.dispose(); done(question); assert.equal(await pending, false);
  assert.equal(model.state.detail, null); assert.equal(model.state.success, '');
  for (const role of ['student', 'admin']) assert.deepEqual(await authorizeRoute({ name: 'teacher-questions', fullPath: '/teacher/questions', meta: { requiresAuth: true, roles: ['teacher'] } },
    { restore: async () => {}, state: { user: { role }, status: 'authenticated' } }), { name: 'forbidden' });
});
