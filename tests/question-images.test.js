import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageUpload, fileError, imageSource, inspectImage } from '../src/questions/images.js';
import { createQuestionMaintenance } from '../src/questions/maintenance.js';
import { questionInput } from '../src/questions/questions.js';
import { createApiClient } from '../src/api/client.js';
import { createTokenStore } from '../src/api/token.js';

const file = () => new Blob(['fictional image bytes'], { type: 'image/png' });
const question = { id: 'q', prompt: '题干', reference_answer: '答案', rubric: null, max_score: 10, is_active: true, image_urls: ['/uploads/images/a.png'] };

test('MIME and byte checks include 5 MiB boundary; safe display URLs exclude credentials and executable schemes', () => {
  for (const type of ['image/png', 'image/jpeg']) assert.equal(fileError({ type, size: 5 * 1024 * 1024 }), '');
  for (const size of [0, 5 * 1024 * 1024 + 1]) assert.ok(fileError({ type: 'image/png', size }));
  assert.ok(fileError({ type: 'image/svg+xml', size: 10 }));
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,AA', '//evil.test/a', 'https://user:password@example.org/a', '/api/v1/auth/me']) assert.equal(imageSource(url), null);
  for (const url of ['/uploads/images/a.png', 'http://localhost:8000/uploads/images/a.jpg', 'https://images.example.org/a.png']) assert.equal(imageSource(url), url);
});

test('browser decoder validates pixels and always releases temporary URLs on success, failure and cancellation', async () => {
  const oldImage = globalThis.Image, oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  let width = 10000, height = 2000, current, revoked = 0;
  globalThis.Image = class { constructor() { current = this; this.naturalWidth = width; this.naturalHeight = height; } };
  URL.createObjectURL = () => 'blob:fixture'; URL.revokeObjectURL = () => revoked++;
  try {
    let controller = new AbortController(), pending = inspectImage(file(), controller.signal);
    current.onload(); await pending; assert.equal(revoked, 1);
    for (const dimensions of [[10001, 1], [5000, 4001]]) {
      [width, height] = dimensions; pending = inspectImage(file(), controller.signal); current.onload(); await assert.rejects(pending, /像素/);
    }
    pending = inspectImage(file(), controller.signal); current.onerror(); await assert.rejects(pending, /无法读取/);
    controller = new AbortController(); pending = inspectImage(file(), controller.signal); controller.abort(); await assert.rejects(pending, /取消/);
    assert.equal(revoked, 5);
  } finally { globalThis.Image = oldImage; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; }
});

test('upload sends authenticated FormData file through API client, not JSON or a direct static request', async () => {
  const tokenStore = createTokenStore(); tokenStore.set('fixture-token'); let seen;
  const api = createApiClient({ tokenStore, adapter: async config => { seen = config; return { config, status: 200, data: { url: '/uploads/images/new.png' }, headers: {} }; } });
  const model = createImageUpload(api, async () => {});
  assert.equal(await model.upload(file()), '/uploads/images/new.png');
  assert.equal(seen.url, '/uploads/images'); assert.equal(seen.baseURL, '/api/v1');
  assert.equal(seen.headers.get('Authorization'), 'Bearer fixture-token');
  assert.ok(seen.data instanceof FormData); assert.deepEqual([...seen.data.keys()], ['file']); assert.equal(seen.data.get('file').type, 'image/png');
});

test('validation and server errors do not add URLs; uncertain upload never automatically retries', async () => {
  let calls = 0, failure = { status: 413 };
  const model = createImageUpload({ post: async () => { calls++; throw failure; } }, async () => {});
  assert.equal(await model.upload(new Blob(['x'], { type: 'image/svg+xml' })), null); assert.equal(calls, 0);
  for (const status of [400, 401, 403, 413, 415, 422, 503, 0]) {
    failure = { status, message: '拒绝' }; const before = calls;
    assert.equal(await model.upload(file()), null); assert.equal(calls, before + 1); assert.ok(model.state.error);
    if (!status || status >= 500) assert.match(model.state.error, /不确定/);
  }
});

test('upload double clicks are ignored, disposal aborts and late response cannot append an image', async () => {
  let resolve, config, calls = 0;
  const model = createImageUpload({ post: (_url, _data, options) => { calls++; config = options; return new Promise(done => { resolve = done; }); } }, async () => {});
  const pending = model.upload(file()); await Promise.resolve();
  assert.equal(await model.upload(file()), null); assert.equal(calls, 1);
  model.dispose(); assert.equal(config.signal.aborted, true); resolve({ url: '/uploads/images/late.png' });
  assert.equal(await pending, null); assert.equal(model.state.notice, '');
});

test('create copies uploaded URLs; unchanged edit omits them, removals send empty array, 409 retains image draft', async () => {
  const form = { ...question, max_score: '10', rubric: '' };
  const input = questionInput(form); form.image_urls = []; assert.deepEqual(input.body.image_urls, question.image_urls);
  const calls = []; let conflict = false;
  const model = createQuestionMaintenance({ patch: async (_url, body) => { calls.push(body); if (conflict) throw { status: 409 }; return question; }, get: async () => question });
  model.begin(question, 'edit'); await model.submit(); assert.equal(Object.hasOwn(calls[0], 'image_urls'), false);
  model.state.form.image_urls = []; await model.submit(); assert.deepEqual(calls[1].image_urls, []);
  model.state.form.image_urls = ['/uploads/images/new.png']; conflict = true; await model.submit(); await model.refresh();
  assert.deepEqual(model.state.form.image_urls, ['/uploads/images/new.png']); assert.deepEqual(model.state.latest.image_urls, question.image_urls);
});
