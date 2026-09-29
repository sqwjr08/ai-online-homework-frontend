import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageAccount, createMaintenanceModel } from '../src/accounts/maintenance.js';
import { createSession, SESSION_KEY } from '../src/auth/session.js';
import { ApiError } from '../src/api/errors.js';
const account = { id: 'student-id', username: 'fictional_student', role: 'student', is_active: true };

test('admin and unknown roles are protected; explicit status target and duplicate click protection', async () => {
  let finish;
  let calls = 0;
  const model = createMaintenanceModel({ patch: (path, body) => {
    calls++; assert.equal(path, '/users/student-id/status'); assert.deepEqual(body, { is_active: false });
    return new Promise(resolve => { finish = resolve; });
  } });
  for (const role of ['admin', 'unknown']) {
    assert.equal(canManageAccount({ role }), false);
    assert.equal(model.open({ ...account, role }, 'status'), false);
  }
  model.open(account, 'status');
  const pending = model.confirm();
  assert.equal(model.close(), false);
  assert.equal(model.open(account, 'password'), false);
  assert.equal(await model.confirm(), false);
  finish({ ...account, is_active: false });
  assert.equal(await pending, true);
  assert.equal(calls, 1);
  assert.match(model.state.success, /停用/);
  assert.equal(model.state.target, null);
});

test('reset validates password and confirmation, preserves whitespace, does not persist it or activate user', async () => {
  let calls = 0;
  const model = createMaintenanceModel({ post: async (path, body) => {
    calls++; assert.equal(path, '/users/student-id/reset-password'); assert.deepEqual(body, { password: ' new-pass ' });
    return { ...account, is_active: false };
  } });
  model.open(account, 'password');
  for (const password of ['abc', '    ', 'x'.repeat(129)]) assert.equal(await model.confirm(password, password), false);
  assert.equal(await model.confirm('valid-pass', 'different'), false);
  assert.equal(calls, 0);
  assert.equal(await model.confirm(' new-pass ', ' new-pass '), true);
  assert.match(model.state.success, /仍为停用/);
  assert.equal(JSON.stringify(model.state).includes('new-pass'), false);
});

test('403, 404 and 409 require refreshed selection; 422 allows corrected input without raw echo', async () => {
  for (const status of [403, 404, 409, 422]) {
    let calls = 0;
    const model = createMaintenanceModel({ post: async () => { calls++; throw new ApiError('generic', { status, detail: 'sensitive', fieldErrors: [{ path: ['body', 'password'], message: 'sensitive' }] }); } });
    model.open(account, 'password');
    await model.confirm('valid-pass', 'valid-pass');
    assert.equal(model.state.blocked, status !== 422);
    assert.ok(model.state.error);
    assert.equal(JSON.stringify(model.state).includes('sensitive'), false);
    if (status !== 422) { await model.confirm('valid-pass', 'valid-pass'); assert.equal(calls, 1); }
  }
});

test('uncertain writes never retry or claim success, password cannot be checked by a list', async () => {
  for (const action of ['status', 'password']) {
    let calls = 0;
    const fail = async () => { calls++; throw new ApiError('timeout', { kind: 'timeout' }); };
    const model = createMaintenanceModel({ post: fail, patch: fail });
    model.open(account, action);
    await model.confirm('valid-pass', 'valid-pass');
    await model.confirm('valid-pass', 'valid-pass');
    assert.equal(calls, 1); assert.equal(model.state.blocked, true); assert.equal(model.state.success, '');
    if (action === 'password') assert.match(model.state.error, /列表无法验证密码/);
    assert.equal(model.close(), true);
    assert.equal(model.state.target, null);
  }
});

test('late mutation response after leaving the page cannot revive target or show success', async () => {
  let finish;
  const model = createMaintenanceModel({ patch: () => new Promise(resolve => { finish = resolve; }) });
  model.open({ ...account, is_active: false }, 'status');
  const pending = model.confirm(); model.dispose(); finish(account);
  assert.equal(await pending, false); assert.equal(model.state.success, ''); assert.equal(model.state.target, null);
});

test('simulated revocation after status change or reset clears the affected frontend session on its next request', async () => {
  // Contract simulation only: does not prove real backend token_version enforcement.
  for (const action of ['status', 'password']) {
    let revoked = false;
    const map = new Map([[SESSION_KEY, 'fictional-old-token']]);
    const session = createSession({ storage: { getItem: key => map.get(key), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
      adapter: async config => {
        if (revoked) throw { config, response: { status: 401, data: { detail: 'Token revoked' } } };
        return { config, status: 200, headers: {}, data: account };
      } });
    await session.restore();
    assert.equal(session.state.status, 'authenticated');
    const changed = async () => { revoked = true; return { ...account, is_active: action === 'password' }; };
    const model = createMaintenanceModel({ patch: changed, post: changed });
    model.open(account, action); await model.confirm('valid-pass', 'valid-pass');
    await assert.rejects(session.api.get('/auth/me'));
    assert.equal(session.state.user, null); assert.equal(map.has(SESSION_KEY), false);
  }
});
