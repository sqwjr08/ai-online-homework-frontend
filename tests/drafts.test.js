import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftsModel, draftInput, emptyDraft, localDeadline } from '../src/assignments/drafts.js';
import { authorizeRoute } from '../src/auth/guard.js';
const question = { id: 'q1', prompt: '虚构题目', max_score: 10, reference_answer: '答案', rubric: null, image_urls: [] };
const saved = { id: 'a1', title: '草稿', description: null, class_id: 'c1', due_at: null, status: 'draft', view: 'teacher', question_source: 'draft_preview', questions: [{ ...question, question_id: 'q1', position: 1 }] };
function fill(model) { model.begin(); Object.assign(model.state.form, { title: ' 草稿 ', class_id: 'c1' }); model.add(question); model.state.lockAcknowledged = true; }

test('draft payload explicitly overrides published default; edit excludes immutable fields, empty and duplicate selections rejected', () => {
  const form = { ...emptyDraft(), title: ' 标题 ', class_id: 'c', questions: [{ question_id: 'q2' }, { question_id: 'q1' }] };
  assert.deepEqual(draftInput(form).body, { title: '标题', description: null, due_at: null, questions: [{ question_id: 'q2' }, { question_id: 'q1' }], class_id: 'c', status: 'draft' });
  const edited = draftInput(form, true).body; assert.equal('status' in edited, false); assert.equal('class_id' in edited, false);
  for (const questions of [[], [{ question_id: 'x' }, { question_id: 'x' }]]) assert.ok(draftInput({ ...form, questions }).errors.questions);
  assert.ok(draftInput({ ...form, title: ' ' }).errors.title); assert.ok(draftInput({ ...form, title: '字'.repeat(201) }).errors.title);
});

test('local deadline converts to UTC, preserves milliseconds, permits past draft dates and rejects invalid dates', () => {
  const previous = process.env.TZ; process.env.TZ = 'Asia/Shanghai';
  try {
    const form = { ...emptyDraft(), title: '题', class_id: 'c', questions: [{ question_id: 'q' }], due: '2020-01-02T08:30:15.1' };
    assert.equal(draftInput(form).body.due_at, '2020-01-02T00:30:15.100Z');
    assert.equal(localDeadline('2020-01-02T00:30:15.100Z'), '2020-01-02T08:30:15.100');
    assert.ok(draftInput({ ...form, due: '2030-02-30T10:00' }).errors.due);
    assert.equal(draftInput({ ...form, due: '' }).body.due_at, null);
    process.env.TZ = 'America/New_York';
    assert.ok(draftInput({ ...form, due: '2030-03-10T02:30' }).errors.due);
    const original = '2030-11-03T06:30:00.000Z', local = localDeadline(original);
    assert.equal(draftInput({ ...form, due: local, original_due: original, original_local: local }).body.due_at, original);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('selection is unique and ordered; create prevents duplicate writes and preserves success when refresh fails', async () => {
  let resolve, calls = [];
  const model = createDraftsModel({ post: (...args) => { calls.push(args); return new Promise(done => { resolve = done; }); }, get: async () => { throw { message: '列表失败' }; } });
  fill(model); model.add(question); model.add({ ...question, id: 'q2' }); model.move(1, -1);
  assert.deepEqual(model.state.form.questions.map(q => q.question_id), ['q2', 'q1']);
  model.remove(1); const pending = model.save(); assert.equal(await model.save(), false);
  assert.equal(calls.length, 1); assert.equal(calls[0][1].status, 'draft');
  resolve(saved); assert.equal(await pending, true); assert.match(model.state.success, /已保存/); assert.equal(model.state.listError, '列表失败'); assert.equal(model.state.id, 'a1');
});

test('saved draft GET repopulates actual contents; PATCH edits ordered IDs only; published becomes readonly', async () => {
  const calls = []; let current = saved;
  const model = createDraftsModel({ get: async url => url === '/assignments/my' ? [saved] : current, patch: async (...args) => { calls.push(args); return saved; } });
  await model.open('a1'); assert.equal(model.state.form.questions[0].reference_answer, '答案');
  model.state.lockAcknowledged = true; await model.save();
  assert.equal(calls[0][0], '/assignments/a1'); assert.deepEqual(calls[0][1].questions, [{ question_id: 'q1' }]); assert.equal('class_id' in calls[0][1], false);
  model.close(); current = { ...saved, status: 'published' }; await model.open('a1'); assert.equal(await model.save(), false); assert.equal(calls.length, 1);
});

test('409 and uncertain writes preserve drafts and block direct retries; read latest never overwrites inputs', async () => {
  let writes = 0, current = saved;
  const model = createDraftsModel({ get: async () => current, patch: async () => { writes++; throw { status: 409 }; } });
  await model.open('a1'); model.state.form.title = '未保存'; model.state.lockAcknowledged = true;
  await model.save(); await model.save(); assert.equal(writes, 1);
  current = { ...saved, status: 'published' }; await model.check(); model.acknowledge();
  assert.equal(model.state.form.title, '未保存'); assert.equal(model.state.blocked, true);
  current = saved; await model.check(); model.acknowledge(); assert.equal(model.state.blocked, false);
  let posts = 0; const creation = createDraftsModel({ post: async () => { posts++; throw { status: 503 }; }, get: async () => [saved] });
  fill(creation); await creation.save(); await creation.save(); assert.equal(posts, 1);
  await creation.check(); assert.equal(creation.state.checked, true); assert.equal(creation.state.id, null); assert.equal(creation.state.form.title, ' 草稿 ');
});

test('400/403/404/422 preserve input; lock acknowledgement is required; disposal ignores late writes and reads', async () => {
  let status = 400, writes = 0;
  const model = createDraftsModel({ post: async () => { writes++; throw { status, message: '失败' }; } });
  fill(model); model.state.lockAcknowledged = false; await model.save(); assert.equal(writes, 0);
  model.state.lockAcknowledged = true;
  for (status of [400, 403, 404, 422]) { await model.save(); assert.equal(model.state.form.title, ' 草稿 '); assert.ok(model.state.error); }
  let resolve; const pendingModel = createDraftsModel({ post: () => new Promise(done => { resolve = done; }) });
  fill(pendingModel); const pending = pendingModel.save(); pendingModel.dispose(); resolve(saved); assert.equal(await pending, false); assert.equal(pendingModel.state.form, null);
  const reading = createDraftsModel({ get: () => new Promise(done => { resolve = done; }) });
  const request = reading.open('a1'); reading.dispose(); resolve(saved); await request; assert.equal(reading.state.form, null);
});

test('list uses draft status and active classes, late lists cannot replace newer results; teacher route rejects students', async () => {
  const calls = []; const model = createDraftsModel({ get: (url, config) => new Promise(resolve => calls.push({ url, config, resolve })) });
  const first = model.load(), second = model.load(); assert.equal(calls[0].config.signal.aborted, true);
  assert.deepEqual(calls[1].config.params, { status: 'draft' }); calls[1].resolve([saved]); await second; calls[0].resolve([]); await first; assert.equal(model.state.items.length, 1);
  const groups = model.loadGroups(); assert.deepEqual(calls[2].config.params, { is_active: true }); calls[2].resolve([]); await groups;
  const route = { name: 'teacher-assignments', fullPath: '/teacher/assignments', meta: { requiresAuth: true, roles: ['teacher'] } };
  const session = { restore: async () => {}, state: { status: 'authenticated', user: { role: 'student' } } };
  assert.deepEqual(await authorizeRoute(route, session), { name: 'forbidden' });
});
