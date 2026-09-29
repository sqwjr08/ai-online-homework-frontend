import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.js';
import { createTokenStore } from '../src/api/token.js';
import { ApiError } from '../src/api/errors.js';

const response = (config, data, status = 200) => ({ config, data, status, headers: {}, statusText: '' });
const failure = (config, status, detail) => Object.assign(new Error('raw transport error'), {
  config, response: response(config, { detail }, status),
});

test('returns object/array/page directly, including 201 and 202, and sends current bearer', async () => {
  const tokenStore = createTokenStore();
  let payload;
  let status = 200;
  let seen;
  const api = createApiClient({ tokenStore, adapter: async config => {
    seen = config;
    return response(config, payload, status);
  } });
  for (const value of [{ id: 'fictional' }, [], { items: [], total: 0, page: 1, page_size: 20 }]) {
    payload = value;
    assert.deepEqual(await api.get('/questions', { params: { q: '中文 .*' } }), value);
    assert.equal(seen.baseURL, '/api/v1');
    assert.equal(seen.headers.get('Authorization'), undefined);
    assert.deepEqual(seen.params, { q: '中文 .*' });
  }
  tokenStore.set('fictional-token');
  for (status of [201, 202]) {
    payload = { status: 'pending_teacher_review' };
    assert.deepEqual(await api.post('/assignments/example/submissions', { answers: [] }), payload);
    assert.equal(seen.headers.get('Authorization'), 'Bearer fictional-token');
    assert.equal(seen.withCredentials, false);
  }
  await api.post('/auth/login', {}, { skipAuth: true, headers: { Authorization: 'stale' } });
  assert.equal(seen.headers.get('Authorization'), undefined);
});

test('401 clears only the matching authenticated session; 403 and login errors do not', async () => {
  const tokenStore = createTokenStore();
  let expired = 0;
  let code = 403;
  const api = createApiClient({ tokenStore, onUnauthorized: () => expired++, adapter: async config => {
    throw failure(config, code, 'Forbidden');
  } });
  tokenStore.set('fictional-token');
  await assert.rejects(api.get('/auth/me'), error => error.status === 403);
  assert.equal(tokenStore.get(), 'fictional-token');
  code = 401;
  await assert.rejects(api.post('/auth/login', {}, { skipAuth: true }), error => error.status === 401);
  assert.equal(tokenStore.get(), 'fictional-token');
  await assert.rejects(api.get('/auth/me'), error => error.kind === 'unauthorized');
  assert.equal(tokenStore.get(), null);
  assert.equal(expired, 1);
});

test('a delayed 401 cannot clear a newer login or repeatedly notify for the old session', async () => {
  const tokenStore = createTokenStore();
  let expired = 0;
  const pending = [];
  const api = createApiClient({ tokenStore, onUnauthorized: () => expired++, adapter: config =>
    new Promise((_resolve, reject) => pending.push(() => reject(failure(config, 401, 'Invalid token')))) });
  tokenStore.set('old-fictional-token');
  const first = assert.rejects(api.get('/auth/me'), ApiError);
  const second = assert.rejects(api.get('/classes/my'), ApiError);
  await new Promise(resolve => setImmediate(resolve));
  tokenStore.set('new-fictional-token');
  pending.forEach(reject => reject());
  await Promise.all([first, second]);
  assert.equal(tokenStore.get(), 'new-fictional-token');
  assert.equal(expired, 0);
});

test('normalizes business/validation errors without retaining submitted input or transport config', async () => {
  let detail;
  let status;
  const api = createApiClient({ adapter: async config => { throw failure(config, status, detail); } });
  for (status of [400, 404, 409, 413, 415, 503]) {
    detail = 'Known server reason';
    await assert.rejects(api.get('/questions'), error => {
      assert.equal(error.status, status);
      assert.equal(error.detail, status < 500 ? detail : null);
      assert.equal(error.config, undefined);
      assert.equal(error.response, undefined);
      return true;
    });
  }
  status = 422;
  detail = [{ loc: ['body', 'answers', 0, 'answer_text'], msg: 'Required', input: 'private answer', ctx: { password: 'private' } }];
  await assert.rejects(api.post('/assignments/example/submissions', {}), error => {
    assert.equal(error.kind, 'validation');
    assert.deepEqual(error.fieldErrors, [{ path: ['body', 'answers', 0, 'answer_text'], message: 'Required' }]);
    assert.ok(!JSON.stringify(error).includes('private'));
    return true;
  });
});

test('timeout, network failure and cancellation remain distinct and never retry a POST', async () => {
  for (const [code, kind] of [['ECONNABORTED', 'timeout'], ['ERR_NETWORK', 'network'], ['ERR_CANCELED', 'cancelled']]) {
    let calls = 0;
    const api = createApiClient({ adapter: async () => {
      calls++;
      throw Object.assign(new Error('sensitive raw message'), { code });
    } });
    await assert.rejects(api.post('/assignments/example/submissions', {}), error => error.kind === kind);
    assert.equal(calls, 1);
  }
});

test('rejects old absolute URLs and prefix/parent-path overrides before attaching or sending credentials', async () => {
  let calls = 0;
  const tokenStore = createTokenStore();
  tokenStore.set('fictional-token');
  const api = createApiClient({ tokenStore, adapter: async config => { calls++; return response(config, {}); } });
  for (const url of ['https://localhost:443/api/check-login', '//elsewhere/me', '/api/v1/auth/me', '/../auth/me', '/%2e%2e/me', '/\\elsewhere/me']) {
    await assert.rejects(api.get(url), error => error.kind === 'configuration');
  }
  await assert.rejects(api.get('/auth/me', { baseURL: 'https://elsewhere' }), error => error.kind === 'configuration');
  assert.equal(calls, 0);
});
