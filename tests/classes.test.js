import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassesModel } from '../src/classes/classes.js';
import { ApiError } from '../src/api/errors.js';
import { authorizeRoute } from '../src/auth/guard.js';
const group = { id: 'class-a', name: '虚构一班', code: 'ABC123', is_active: true };

test('teacher creates with normalized name only, validates limits and blocks duplicate clicks', async () => {
  let done, writes = 0;
  const model = createClassesModel({ post: (url, body) => {
    writes++; assert.equal(url, '/classes'); assert.deepEqual(body, { name: '虚构一班' });
    return new Promise(resolve => { done = resolve; });
  }, get: async () => [group] });
  assert.equal(await model.create('   '), false);
  assert.equal(await model.create('字'.repeat(101)), false);
  const pending = model.create('  虚构一班  ');
  assert.equal(await model.create(group.name), false);
  done(group); assert.equal(await pending, true); assert.equal(writes, 1);
  assert.match(model.state.success, /ABC123/);
  assert.equal(model.state.groups.length, 1);
});

test('list passes false filter and keeps latest response; switching class suppresses stale members', async () => {
  const calls = [];
  const model = createClassesModel({ get: (url, config) => new Promise(resolve => calls.push({ url, config, resolve })) });
  const old = model.load(); model.state.filter = 'false'; const current = model.load();
  assert.deepEqual(calls[1].config.params, { is_active: false });
  calls[1].resolve([{ ...group, is_active: false }]); await current;
  calls[0].resolve([]); await old; assert.equal(model.state.groups.length, 1);
  const first = model.select(group), second = model.select({ ...group, id: 'class-b' });
  assert.equal(calls[2].config.signal.aborted, true);
  calls[3].resolve({ items: [{ id: 'b', username: 'member_b' }], total: 1, page: 1, page_size: 20 }); await second;
  calls[2].resolve({ items: [{ id: 'a' }], total: 1, page: 1, page_size: 20 }); await first;
  assert.equal(model.state.members[0].id, 'b');
});

test('member pagination/filter use backend contract; forbidden is not interpreted as an empty class', async () => {
  let fail = false;
  const model = createClassesModel({ get: async (url, config) => {
    assert.equal(url, '/classes/class-a/members');
    if (fail) throw new ApiError('没有权限执行此操作。', { status: 403 });
    if (config.params.page === 2) assert.deepEqual(config.params, { page: 2, page_size: 20, is_active: false });
    return { items: [{ id: 'member' }], total: 25, page: config.params.page, page_size: 20 };
  } });
  await model.select(group); model.state.memberFilter = 'false'; await model.loadMembers(2);
  assert.equal(model.state.page, 2); assert.equal(model.state.total, 25);
  fail = true; await model.loadMembers(); assert.match(model.state.membersError, /没有权限/); assert.deepEqual(model.state.members, []);
});

test('archive requires selection, cancellation writes nothing, duplicate and archived actions blocked', async () => {
  let writes = 0, done;
  const model = createClassesModel({ get: async () => [{ ...group, is_active: false }], post: url => {
    writes++; assert.equal(url, '/classes/class-a/archive'); return new Promise(resolve => { done = resolve; });
  } });
  assert.equal(await model.archive(), false);
  assert.equal(model.requestArchive({ ...group, is_active: false }), false);
  model.requestArchive(group); model.cancelArchive(); assert.equal(await model.archive(), false);
  model.requestArchive(group); const pending = model.archive();
  assert.equal(await model.archive(), false); done({ ...group, is_active: false }); await pending;
  assert.equal(writes, 1); assert.match(model.state.success, /已归档/); assert.equal(model.state.groups[0].is_active, false);
  assert.equal(model.state.archiveTarget, null);
});

test('unknown create outcome blocks repost until explicit refresh, without claiming same-name success', async () => {
  let writes = 0, fail = true;
  const model = createClassesModel({ post: async () => { writes++; throw new ApiError('timeout', { kind: 'timeout' }); },
    get: async () => { if (fail) throw new ApiError('offline'); return [group, { ...group, id: 'duplicate-name', code: 'XYZ999' }]; } });
  await model.create(group.name); await model.create(group.name); assert.equal(writes, 1);
  await model.checkResult(); assert.equal(model.state.uncertain, true);
  fail = false; await model.checkResult(); assert.equal(model.state.uncertain, false);
  assert.equal(model.state.success, ''); assert.match(model.state.writeError, /核对班级码/);
});

test('archive failures do not invent success; disposal ignores late writes; student/admin denied teacher route', async () => {
  for (const status of [403, 404, 409, 503]) {
    const model = createClassesModel({ post: async () => { throw new ApiError('failed', { status }); } });
    model.requestArchive(group); assert.equal(await model.archive(), false);
    assert.ok(model.state.writeError); assert.equal(model.state.success, ''); assert.equal(model.state.archiveTarget, null);
  }
  let done;
  const model = createClassesModel({ post: () => new Promise(resolve => { done = resolve; }) });
  const pending = model.create(group.name); model.dispose(); done(group);
  assert.equal(await pending, false); assert.equal(model.state.success, '');
  for (const role of ['student', 'admin']) {
    assert.deepEqual(await authorizeRoute({ name: 'teacher-classes', fullPath: '/teacher/classes', meta: { requiresAuth: true, roles: ['teacher'] } },
      { restore: async () => {}, state: { user: { role }, status: 'authenticated' } }), { name: 'forbidden' });
  }
});
