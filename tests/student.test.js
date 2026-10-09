import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationModel } from '../src/student/registration.js';
import { createStudentClassModel } from '../src/student/my-class.js';
import { createSession } from '../src/auth/session.js';
import { authorizeRoute } from '../src/auth/guard.js';
import { ApiError } from '../src/api/errors.js';
const form = { username: 'fictional_new', password: ' test-pass ', confirmation: ' test-pass ', role: 'admin', is_active: false };
const group = { id: 'class-a', name: '虚构班级', code: 'ABC123', is_active: true };
const user = { id: 'student-id', username: 'fictional_new', role: 'student', is_active: true, class_id: null };

test('registration sends only username/password publicly, validates confirmation and prevents duplicates', async () => {
  let done, writes = 0;
  const model = createRegistrationModel({ post: (url, body, config) => {
    writes++; assert.equal(url, '/auth/register'); assert.deepEqual(body, { username: form.username, password: form.password });
    assert.equal(config.skipAuth, true); return new Promise(resolve => { done = resolve; });
  } });
  assert.equal(await model.register({ ...form, confirmation: 'different' }), false);
  assert.equal(await model.register({ ...form, username: 'bad name' }), false);
  const pending = model.register(form); assert.equal(await model.register(form), false);
  done(user); assert.equal(await pending, true); assert.equal(writes, 1);
  assert.match(model.state.success, /请登录/); assert.equal(JSON.stringify(model.state).includes(form.password), false);
});

test('registration handles duplicate/validation safely and unknown results block automatic repost', async () => {
  for (const status of [409, 422, 503]) {
    let writes = 0;
    const model = createRegistrationModel({ post: async () => { writes++; throw new ApiError('error', { status, fieldErrors: [{ path: ['body', 'password'], message: form.password }] }); } });
    await model.register(form);
    if (status === 409) assert.match(model.state.errors.username, /已存在/);
    if (status === 422) assert.match(model.state.errors.password, /4–128/);
    if (status === 503) { await model.register(form); assert.equal(writes, 1); assert.match(model.state.error, /先尝试/); }
    assert.equal(JSON.stringify(model.state).includes(form.password), false);
  }
});

test('unjoined student joins with normalized code and refreshes user and class without teacher data requests', async () => {
  let joined = false, posts = 0, refreshes = 0;
  const model = createStudentClassModel({ get: async url => { assert.equal(url, '/classes/my'); return joined ? [group] : []; },
    post: async (url, body) => { assert.equal(url, '/classes/join'); assert.deepEqual(body, { code: 'ABC123' }); posts++; joined = true; return group; } },
  async () => { refreshes++; return { ...user, class_id: joined ? group.id : null }; });
  assert.equal(await model.join('ABC123'), false);
  await model.load(); assert.equal(await model.join('123'), false);
  assert.equal(await model.join(' abc123 '), true);
  assert.equal(model.state.group.id, group.id); assert.equal(refreshes, 2);
  assert.equal(await model.join('XYZ999'), false); assert.equal(posts, 1);
});

test('404 reports invalid/archived code, 409 refreshes the real relationship, including archived classes', async () => {
  let current = null, code = 404;
  const model = createStudentClassModel({ get: async () => current ? [current] : [], post: async () => {
    if (code === 409) current = { ...group, is_active: false };
    throw new ApiError('failure', { status: code });
  } }, async () => ({ ...user, class_id: current?.id || null }));
  await model.load(); await model.join('ABC123'); assert.match(model.state.joinError, /已归档/);
  code = 409; await model.join('XYZ999'); assert.match(model.state.joinError, /不能转班/);
  assert.equal(model.state.group.is_active, false); assert.equal(await model.join('XYZ999'), false);
});

test('read failures and inconsistent class relationships never show an unjoined state; unknown join requires query', async () => {
  let readFail = true, joined = false, writes = 0;
  const model = createStudentClassModel({ get: async () => { if (readFail) throw new ApiError('offline'); return joined ? [group] : []; },
    post: async () => { writes++; joined = true; throw new ApiError('timeout', { kind: 'timeout' }); } }, async () => ({ ...user, class_id: joined ? group.id : null }));
  await model.load(); assert.equal(model.state.loaded, false); assert.equal(await model.join('ABC123'), false);
  readFail = false; await model.load(); await model.join('ABC123'); await model.join('ABC123');
  assert.equal(writes, 1); assert.equal(model.state.requiresCheck, true);
  await model.load(); assert.equal(model.state.group.id, group.id); assert.equal(model.state.requiresCheck, false);
  const inconsistent = createStudentClassModel({ get: async () => [] }, async () => ({ ...user, class_id: group.id }));
  await inconsistent.load(); assert.equal(inconsistent.state.loaded, false); assert.match(inconsistent.state.error, /无法核实/);
});

test('same-class success response from stale page is accepted; disposed page ignores late registration/join', async () => {
  let joined = false, done;
  const model = createStudentClassModel({ get: async () => joined ? [group] : [], post: () => new Promise(resolve => { done = resolve; }) }, async () => ({ ...user, class_id: joined ? group.id : null }));
  await model.load(); const pending = model.join('ABC123');
  assert.equal(await model.join('ABC123'), false); joined = true; done(group); assert.equal(await pending, true);
  const registration = createRegistrationModel({ post: () => new Promise(resolve => { done = resolve; }) });
  const registering = registration.register(form); registration.dispose(); done(user); assert.equal(await registering, false);
  const late = createStudentClassModel({ get: async () => [], post: () => new Promise(resolve => { done = resolve; }) }, async () => user);
  await late.load(); const joining = late.join('ABC123'); late.dispose(); done(group); assert.equal(await joining, false); assert.equal(late.state.group, null);
});

test('refresh updates cached class id but a response after logout cannot revive the session', async () => {
  let current = user, finish;
  const session = createSession({ adapter: async config => {
    let data = config.url === '/auth/login' ? { access_token: 'fictional', token_type: 'bearer' } : current;
    if (config.url === '/auth/me' && finish === 'defer') data = await new Promise(resolve => { finish = resolve; });
    return { config, status: 200, headers: {}, data };
  } });
  await session.login('fictional', 'fake-pass'); current = { ...user, class_id: group.id }; await session.refreshUser();
  assert.equal(session.state.user.class_id, group.id);
  finish = 'defer'; const pending = assert.rejects(session.refreshUser());
  await new Promise(resolve => setImmediate(resolve)); await session.logout(); finish(current); await pending;
  assert.equal(session.state.user, null);
});

test('registration is guest-only while class entry requires student role', async () => {
  for (const role of ['teacher', 'admin', 'student']) {
    const auth = { restore: async () => {}, state: { user: { role }, status: 'authenticated' } };
    assert.equal(await authorizeRoute({ name: 'register', meta: {} }, auth), `/${role}`);
    const result = await authorizeRoute({ name: 'student-class', fullPath: '/student/class', meta: { requiresAuth: true, roles: ['student'] } }, auth);
    assert.deepEqual(result, role === 'student' ? true : { name: 'forbidden' });
  }
});
