import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionMaintenance } from '../src/questions/maintenance.js';
const question = { id: 'q1', prompt: '题干', reference_answer: '答案', max_score: 10, rubric: '标准', image_urls: ['/uploads/keep.png'], is_active: true };

test('text PATCH preserves images by omission, clears rubric with null and validates before sending', async () => {
  const calls = [];
  const model = createQuestionMaintenance({ patch: async (...args) => { calls.push(args); return question; } });
  model.begin(question, 'edit'); model.state.form.max_score = '0';
  assert.equal(await model.submit(), null); assert.equal(calls.length, 0);
  model.state.form.max_score = '2.5'; model.state.form.rubric = ''; model.state.form.prompt = ' 修改 ';
  assert.equal(await model.submit(), question);
  assert.deepEqual(calls, [['/questions/q1', { prompt: '修改', reference_answer: '答案', max_score: 2.5, rubric: null }]]);
  assert.deepEqual(question.image_urls, ['/uploads/keep.png']);
});

test('409 blocks resubmission; refresh and explicit acknowledgement preserve draft and target', async () => {
  let writes = 0;
  const model = createQuestionMaintenance({ patch: async () => { writes++; throw { status: 409 }; }, get: async () => ({ ...question, prompt: '别人修改的题干' }) });
  model.begin(question, 'edit'); model.state.form.prompt = '未保存输入';
  await model.submit(); await model.submit(); assert.equal(writes, 1); assert.equal(model.state.blocked, true);
  model.begin({ ...question, id: 'q2' }, 'edit'); assert.equal(model.state.target, 'q1');
  await model.refresh(); assert.equal(model.state.form.prompt, '未保存输入'); assert.equal(model.state.latest.prompt, '别人修改的题干');
  await model.submit(); assert.equal(writes, 1);
  model.acknowledge(); await model.submit(); assert.equal(writes, 2); assert.equal(model.state.blocked, true);
});

test('disable requires explicit confirmation and sends no body; inactive state prevents new operations', async () => {
  const calls = [];
  const model = createQuestionMaintenance({ post: async (...args) => { calls.push(args); return { ...question, is_active: false }; } });
  model.begin({ ...question, is_active: false }, 'edit'); assert.equal(model.state.target, null);
  model.begin(question, 'disable'); assert.equal(await model.submit(), null);
  model.state.confirmed = true; assert.equal((await model.submit()).is_active, false);
  assert.deepEqual(calls, [['/questions/q1/disable']]);
});

test('uncertain writes do not retry and refreshed inactive question cannot be acknowledged for another write', async () => {
  let writes = 0;
  const model = createQuestionMaintenance({ post: async () => { writes++; throw { status: 503 }; }, get: async () => ({ ...question, is_active: false }) });
  model.begin(question, 'disable'); model.state.confirmed = true;
  await model.submit(); await model.submit(); assert.equal(writes, 1);
  await model.refresh(); model.acknowledge(); assert.equal(model.state.blocked, true);
  assert.equal(model.state.form.prompt, question.prompt);
});

test('422 and access errors preserve input without echoing raw validation detail; failed refresh retains block', async () => {
  let failure = { status: 422, fieldErrors: [{ path: ['body', 'prompt'], message: 'secret raw data' }] };
  const model = createQuestionMaintenance({ patch: async () => { throw failure; }, get: async () => { throw { status: 404, message: '不存在' }; } });
  model.begin(question, 'edit'); model.state.form.prompt = '草稿';
  await model.submit(); assert.ok(model.state.errors.prompt); assert.ok(!JSON.stringify(model.state).includes('secret'));
  for (const status of [403, 404]) { failure = { status, message: '无权或不存在' }; await model.submit(); assert.equal(model.state.form.prompt, '草稿'); }
  failure = { status: 409 }; await model.submit(); await model.refresh(); model.acknowledge();
  assert.equal(model.state.blocked, true); assert.equal(model.state.latest, null);
});

test('duplicate writes and closing during requests are blocked; disposed responses cannot restore sensitive content', async () => {
  let resolve, calls = 0;
  const model = createQuestionMaintenance({ patch: () => { calls++; return new Promise(done => { resolve = done; }); } });
  model.begin(question, 'edit'); const pending = model.submit(); model.close(); await model.submit();
  assert.equal(calls, 1); assert.equal(model.state.target, 'q1');
  model.dispose(); resolve(question); assert.equal(await pending, null); assert.equal(model.state.target, null); assert.deepEqual(model.state.form, {});
  let finish;
  const refresh = createQuestionMaintenance({ get: () => new Promise(done => { finish = done; }) });
  refresh.begin(question, 'edit'); const reading = refresh.refresh(); refresh.dispose(); finish(question); await reading;
  assert.equal(refresh.state.latest, null);
});
