import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssignmentLifecycle, canAct, sourceName } from '../src/assignments/lifecycle.js';
import { createDraftsModel } from '../src/assignments/drafts.js';

const draft = { id: 'a1', title: '虚构作业', class_id: 'c1', status: 'draft', question_source: 'draft_preview', due_at: null, description: null, questions: [] };
const published = { ...draft, status: 'published', question_source: 'snapshot' };

test('status filter supports all statuses without sending empty status; create-result check always searches drafts', async () => {
  const calls = []; const model = createDraftsModel({ get: async (url, config) => { calls.push({ url, config }); return []; }, post: async () => { throw { status: 503 }; } });
  for (const filter of ['draft', 'published', 'archived', '']) { model.state.filter = filter; await model.load(); assert.deepEqual(calls.at(-1).config.params, filter ? { status: filter } : {}); }
  model.begin(); Object.assign(model.state.form, { title: '测试', class_id: 'c1', questions: [{ question_id: 'q' }] }); model.state.lockAcknowledged = true;
  await model.save(); model.state.filter = 'published'; await model.check(); assert.equal(model.state.filter, 'draft'); assert.deepEqual(calls.at(-1).config.params, { status: 'draft' });
});

test('publication reads server preview, requires confirmation, sends bodyless POST and preserves returned snapshot', async () => {
  const calls = []; let resolve;
  const model = createAssignmentLifecycle({ get: async url => { calls.push(['get', url]); return draft; }, post: (...args) => { calls.push(['post', ...args]); return new Promise(done => { resolve = done; }); } });
  await model.prepare('a1', 'publish'); assert.equal(await model.submit(), null);
  model.state.confirmed = true; const pending = model.submit(); assert.equal(await model.submit(), null);
  model.close(); assert.equal(model.state.id, 'a1');
  resolve(published); assert.equal(await pending, published);
  assert.deepEqual(calls, [['get', '/assignments/a1'], ['post', '/assignments/a1/publish']]);
  assert.equal(model.state.record.question_source, 'snapshot'); assert.equal(model.state.action, 'view'); assert.match(model.state.success, /已确认/);
});

test('archive accepts drafts/published and retains server content source; archived cannot publish or archive again', async () => {
  for (const record of [draft, published, { ...published, question_source: 'legacy_reference' }]) {
    const calls = []; const archived = { ...record, status: 'archived' };
    const model = createAssignmentLifecycle({ get: async () => record, post: async (...args) => { calls.push(args); return archived; } });
    await model.prepare('a1', 'archive'); model.state.confirmed = true; await model.submit();
    assert.deepEqual(calls, [['/assignments/a1/archive']]); assert.equal(model.state.record.question_source, record.question_source);
    assert.equal(canAct(archived, 'publish'), false); assert.equal(canAct(archived, 'archive'), false);
  }
  assert.match(sourceName('draft_preview'), /非发布快照/); assert.match(sourceName('legacy_reference'), /非发布快照/); assert.equal(sourceName('snapshot'), '发布时快照');
});

test('expired or server-rejected publication and 409 require new preview and fresh confirmation, no automatic retry', async () => {
  for (const status of [400, 403, 404, 409, 422]) {
    let calls = 0;
    const model = createAssignmentLifecycle({ get: async () => draft, post: async () => { calls++; throw { status }; } });
    await model.prepare('a1', 'publish'); model.state.confirmed = true; await model.submit();
    model.state.confirmed = true; await model.submit(); assert.equal(calls, 1); assert.ok(model.state.error); assert.equal(model.state.blocked, true);
    await model.prepare('a1', 'publish'); assert.equal(model.state.confirmed, false); await model.submit(); assert.equal(calls, 1);
  }
});

test('unknown publication outcome is checked with GET and an already published result cannot be sent again', async () => {
  let record = draft, calls = 0;
  const model = createAssignmentLifecycle({ get: async () => record, post: async () => { calls++; throw { status: 503 }; } });
  await model.prepare('a1', 'publish'); model.state.confirmed = true; await model.submit(); assert.match(model.state.error, /不确定/);
  record = published; await model.prepare('a1', 'publish'); model.state.confirmed = true;
  assert.equal(await model.submit(), null); assert.equal(calls, 1); assert.equal(model.state.success, '');
});

test('failed preview clears stale detail; changed state is checked before each action', async () => {
  let failure = false, record = draft;
  const model = createAssignmentLifecycle({ get: async () => { if (failure) throw { status: 404, message: '不存在' }; return record; }, post: async () => assert.fail('must not write') });
  await model.prepare('a1', 'publish'); failure = true; await model.prepare('a1', 'publish'); assert.equal(model.state.record, null); assert.equal(model.state.blocked, true);
  failure = false; record = { ...draft, status: 'archived' }; await model.prepare('a1', 'publish'); model.state.confirmed = true; assert.equal(await model.submit(), null);
});

test('preview races and disposal cannot restore old or private details; late writes after leaving are ignored', async () => {
  const calls = []; const model = createAssignmentLifecycle({ get: (_url, config) => new Promise(resolve => calls.push({ resolve, config })) });
  const first = model.prepare('a1'), second = model.prepare('a2'); assert.equal(calls[0].config.signal.aborted, true);
  calls[1].resolve({ ...draft, id: 'a2' }); await second; calls[0].resolve(draft); await first; assert.equal(model.state.record.id, 'a2');
  const third = model.prepare('a3'); model.dispose(); calls[2].resolve(draft); await third; assert.equal(model.state.record, null);
  let resolve; const writer = createAssignmentLifecycle({ get: async () => draft, post: () => new Promise(done => { resolve = done; }) });
  await writer.prepare('a1', 'publish'); writer.state.confirmed = true; const writing = writer.submit(); writer.dispose(); resolve(published); assert.equal(await writing, null); assert.equal(writer.state.record, null);
});
