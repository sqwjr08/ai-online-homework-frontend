import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, SESSION_KEY } from '../src/auth/session.js';
import { authorizeRoute, loginDestination } from '../src/auth/guard.js';

const user = role => ({ id: `${role}-id`, role, username: `${role}_demo`, is_active: true, class_id: null });
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map };
}
function reply(config, data) { return { config, status: 200, data, headers: {}, statusText: '' }; }
function fail(config, status) { throw { config, response: { status, data: { detail: 'Fixture failure' } } }; }

test('login verifies me for all roles and persists only token; reload revalidates rather than trusting storage', async () => {
  for (const role of ['teacher', 'student', 'admin']) {
    const saved = storage();
    const calls = [];
    const adapter = async config => {
      calls.push(config.url);
      if (config.url === '/auth/login') return reply(config, { access_token: 'fictional-token', token_type: 'bearer' });
      assert.equal(config.headers.get('Authorization'), 'Bearer fictional-token');
      return reply(config, { ...user(role), secret_extra: 'must not cache' });
    };
    const auth = createSession({ storage: saved, adapter });
    await auth.login('demo', 'fictional-password');
    assert.equal(auth.state.user.role, role);
    assert.equal(auth.state.user.secret_extra, undefined);
    assert.deepEqual([...saved.map], [[SESSION_KEY, 'fictional-token']]);
    const restored = createSession({ storage: saved, adapter });
    assert.equal(restored.state.user, null);
    await Promise.all([restored.restore(), restored.restore()]);
    assert.equal(restored.state.user.role, role);
    assert.deepEqual(calls, ['/auth/login', '/auth/me', '/auth/me']);
  }
});

test('bad credentials, disabled accounts and unknown roles never retain a session', async () => {
  for (const scenario of [401, 403, 'unknown', 'inactive']) {
    const saved = storage();
    const auth = createSession({ storage: saved, adapter: async config => {
      if (config.url === '/auth/login') {
        if (typeof scenario === 'number') return fail(config, scenario);
        return reply(config, { access_token: 'fictional-token', token_type: 'bearer' });
      }
      return reply(config, scenario === 'unknown' ? user('owner') : { ...user('teacher'), is_active: false });
    } });
    await assert.rejects(auth.login('demo', 'fictional-password'));
    assert.equal(auth.state.user, null);
    assert.equal(saved.getItem(SESSION_KEY), null);
  }
});

test('expired restored token is cleared; network failure is retryable and does not authenticate', async () => {
  const saved = storage();
  saved.setItem(SESSION_KEY, 'fictional-token');
  let code = 503;
  const auth = createSession({ storage: saved, adapter: async config => code ? fail(config, code) : reply(config, user('student')) });
  await auth.restore();
  assert.equal(auth.state.status, 'error');
  assert.equal(auth.state.user, null);
  assert.equal(saved.getItem(SESSION_KEY), 'fictional-token');
  code = 0;
  await auth.restore();
  assert.equal(auth.state.user.role, 'student');
  code = 401;
  await assert.rejects(auth.api.get('/auth/me'));
  assert.equal(auth.state.user, null);
  assert.equal(saved.getItem(SESSION_KEY), null);
});

test('logout clears immediately even when the logout endpoint fails; late me cannot restore old user', async () => {
  const saved = storage();
  saved.setItem(SESSION_KEY, 'fictional-token');
  let resolveMe;
  const auth = createSession({ storage: saved, adapter: config => config.url === '/auth/logout'
    ? Promise.reject(new Error('offline')) : new Promise(resolve => { resolveMe = () => resolve(reply(config, user('admin'))); }) });
  const restoring = auth.restore();
  await new Promise(resolve => setImmediate(resolve));
  const loggingOut = auth.logout();
  assert.equal(saved.getItem(SESSION_KEY), null);
  resolveMe();
  await Promise.all([restoring, loggingOut]);
  assert.equal(auth.state.user, null);
  assert.equal(auth.state.status, 'anonymous');
});

test('late login cannot resurrect a session after logout', async () => {
  let resolveLogin;
  const saved = storage();
  const auth = createSession({ storage: saved, adapter: config => config.url === '/auth/login'
    ? new Promise(resolve => { resolveLogin = () => resolve(reply(config, { access_token: 'old', token_type: 'bearer' })); })
    : Promise.resolve(reply(config, {})) });
  const result = assert.rejects(auth.login('demo', 'fake-password'));
  await new Promise(resolve => setImmediate(resolve));
  await auth.logout();
  resolveLogin();
  await result;
  assert.equal(saved.getItem(SESSION_KEY), null);
  assert.equal(auth.state.user, null);
});

test('blocked browser storage still permits memory login and visibly reports the limitation', async () => {
  const auth = createSession({ storage: { getItem() { throw new Error(); }, removeItem() { throw new Error(); }, setItem() { throw new Error(); } },
    adapter: async config => reply(config, config.url === '/auth/login' ? { access_token: 'fake', token_type: 'bearer' } : user('teacher')) });
  await auth.login('demo', 'fake-password');
  assert.equal(auth.state.status, 'authenticated');
  assert.equal(auth.state.storageWarning, true);
});

test('guards deny anonymous and wrong-role entry, and do not mistake connection failure for logged-in state', async () => {
  const auth = { restore: async () => {}, state: { user: null, status: 'anonymous' } };
  const to = { name: 'teacher', fullPath: '/teacher', meta: { requiresAuth: true, roles: ['teacher'] } };
  assert.deepEqual(await authorizeRoute(to, auth), { name: 'login', query: { redirect: '/teacher' } });
  auth.state.user = user('student'); auth.state.status = 'authenticated';
  assert.deepEqual(await authorizeRoute(to, auth), { name: 'forbidden' });
  auth.state.user = user('teacher');
  assert.equal(await authorizeRoute(to, auth), true);
  auth.state.user = null; auth.state.status = 'error';
  assert.deepEqual(await authorizeRoute(to, auth), { name: 'session-error' });
  const router = { resolve: path => ({ fullPath: path, meta: { roles: [path.slice(1)] } }) };
  assert.equal(loginDestination(router, 'https://elsewhere', 'student'), '/student');
  assert.equal(loginDestination(router, '/admin', 'student'), '/student');
  assert.equal(loginDestination(router, '/teacher', 'teacher'), '/teacher');
});
