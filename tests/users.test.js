import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsersModel, validateAccount } from '../src/accounts/users.js';
import { authorizeRoute } from '../src/auth/guard.js';
import { ApiError } from '../src/api/errors.js';
const input = { username: 'fictional_teacher', password: ' fake-pass ', role: 'teacher', is_active: false };

test('account validation matches length, control/whitespace and role boundaries without trimming password', () => {
  assert.deepEqual(validateAccount(input), {});
  for (const username of ['ab', ' xuser', 'user name', 'user\u200bname', 'x'.repeat(51)]) assert.ok(validateAccount({ ...input, username }).username);
  for (const password of ['abc', '    ', 'x'.repeat(129)]) assert.ok(validateAccount({ ...input, password }).password);
  assert.ok(validateAccount({ ...input, role: 'admin' }).role);
});

test('list sends optional filters and false correctly; late response cannot replace a newer query', async () => {
  const calls = [];
  const model = createUsersModel({ get: (url, config) => new Promise(resolve => calls.push({ url, config, resolve })) });
  const first = model.load();
  model.state.filters = { username: '.*', role: 'student', active: 'false' };
  const second = model.load(2);
  assert.deepEqual(calls[0].config.params, { page: 1, page_size: 20 });
  assert.deepEqual(calls[1].config.params, { page: 2, page_size: 20, username: '.*', role: 'student', is_active: false });
  assert.equal(calls[0].config.signal.aborted, true);
  calls[1].resolve({ items: [{ id: 'new' }], total: 25, page: 2, page_size: 20 });
  await second;
  calls[0].resolve({ items: [{ id: 'old' }], total: 1, page: 1, page_size: 20 });
  await first;
  assert.equal(model.state.items[0].id, 'new');
  assert.equal(model.state.page, 2);
  model.dispose();
  assert.deepEqual(model.state.items, []);
});

test('creation sends exact contract, prevents duplicate clicks and records server success independently of list', async () => {
  let resolve;
  let count = 0;
  const model = createUsersModel({ post: (url, body) => {
    count++; assert.equal(url, '/users'); assert.deepEqual(body, input);
    return new Promise(done => { resolve = done; });
  } });
  const pending = model.create(input);
  assert.equal(await model.create(input), false);
  resolve({ username: input.username, role: 'teacher', is_active: false });
  assert.equal(await pending, true);
  assert.equal(count, 1);
  assert.match(model.state.success, /已创建教师/);
  assert.equal(JSON.stringify(model.state).includes(input.password), false);
});

test('duplicate, validation and forbidden creation show actionable feedback without password echo', async () => {
  for (const status of [409, 422, 403]) {
    const model = createUsersModel({ post: async () => { throw new ApiError('没有权限执行此操作。', { status, fieldErrors: [{ path: ['body', 'password'], message: 'do not echo raw input' }] }); } });
    assert.equal(await model.create(input), false);
    if (status === 409) assert.match(model.state.fieldErrors.username, /已存在/);
    if (status === 422) assert.match(model.state.fieldErrors.password, /密码长度/);
    if (status === 403) assert.match(model.state.createError, /没有权限/);
    assert.equal(model.state.uncertain, '');
  }
});

test('unknown write outcome blocks repeat creation until an explicit query succeeds', async () => {
  let writes = 0;
  let failRead = true;
  const model = createUsersModel({ post: async () => { writes++; throw new ApiError('timeout', { kind: 'timeout' }); },
    get: async () => { if (failRead) throw new ApiError('offline'); return { items: [{ username: input.username }], total: 1, page: 1, page_size: 20 }; } });
  await model.create(input); await model.create(input);
  assert.equal(writes, 1);
  await model.checkUncertain();
  assert.equal(model.state.uncertain, input.username);
  failRead = false;
  await model.checkUncertain();
  assert.equal(model.state.uncertain, '');
  assert.match(model.state.createError, /同名账号/);
  assert.equal(writes, 1);
});

test('disposed page ignores creation response; both non-admin roles are rejected at the account route', async () => {
  let resolve;
  const model = createUsersModel({ post: () => new Promise(done => { resolve = done; }) });
  const pending = model.create(input); model.dispose();
  resolve({ username: input.username, role: 'teacher', is_active: true });
  assert.equal(await pending, false);
  assert.equal(model.state.success, '');
  for (const role of ['teacher', 'student']) {
    const result = await authorizeRoute({ name: 'users', fullPath: '/admin/users', meta: { requiresAuth: true, roles: ['admin'] } },
      { restore: async () => {}, state: { user: { role }, status: 'authenticated' } });
    assert.deepEqual(result, { name: 'forbidden' });
  }
});
