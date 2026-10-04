import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRetry, retryEligible } from '../src/assignments/ai-retry.js';
const record = { id: 's', assignment_id: 'a', view: 'teacher', status: 'pending_teacher_review', ai_status: 'failed', ai_retry_count: 0, answers: [] };
const queued = { ...record, ai_status: 'pending', ai_retry_count: 1 };
test('retry requires unconfirmed failed teacher record and valid exact counter', () => {
  assert.equal(retryEligible(record), true);
  for (const ai_status of ['pending', 'processing', 'succeeded', 'cancelled', 'legacy_unknown']) assert.equal(retryEligible({ ...record, ai_status }), false);
  for (const ai_retry_count of [undefined, -1, 0.5, 2147483648]) assert.equal(retryEligible({ ...record, ai_retry_count }), false);
  assert.equal(retryEligible({ ...record, status: 'confirmed' }), false); assert.equal(retryEligible({ ...record, view: 'student' }), false);
});
test('default-off sends nothing; fresh read and explicit acceptance are required for each POST', async () => {
  const calls = [], api = { get: async url => { calls.push(url); return record; }, post: async (url, body) => { calls.push([url, body]); return queued; } };
  const off = createAiRetry(api); await off.prepare(record); await off.submit(); assert.deepEqual(calls, []);
  const model = createAiRetry(api, { enabled: true }); await model.prepare(record); await model.submit(); assert.equal(calls.length, 1);
  model.state.accepted = true; assert.equal(await model.submit(), true); assert.deepEqual(calls[1], ['/submissions/s/retry-grading', { expected_retry_count: 0 }]);
  assert.match(model.state.message, /尚未完成/); assert.equal(model.state.ready, false); await model.submit(); assert.equal(calls.length, 2);
});
test('double click and cancelling or retargeting while POST pending cannot send another request', async () => {
  let resolve, writes = 0; const model = createAiRetry({ get: async () => record, post: () => { writes++; return new Promise(done => { resolve = done; }); } }, { enabled: true });
  await model.prepare(record); model.state.accepted = true; const pending = model.submit(); await model.submit(); await model.prepare({ ...record, id: 'other' });
  assert.equal(model.cancel(), false); assert.equal(model.state.record.id, 's'); resolve(queued); await pending; assert.equal(writes, 1);
});
test('409 reads latest once; even another failed cycle cannot arm or automatically resend new version', async () => {
  let reads = 0, writes = 0, clock = 0;
  const model = createAiRetry({ get: async () => ++reads === 1 ? record : { ...record, ai_retry_count: 1 }, post: async () => { writes++; throw { status: 409 }; } }, { enabled: true, now: () => clock });
  await model.prepare(record); model.state.accepted = true; await model.submit(); assert.equal(reads, 2); assert.equal(model.state.ready, false); assert.equal(model.state.expected, null);
  model.state.accepted = true; await model.submit(); assert.equal(writes, 1);
  clock = 5000; await model.prepare(model.state.record); assert.equal(model.state.expected, 1); assert.equal(model.state.accepted, false);
});
test('manual refresh is rate limited and read-only; no timers or automatic retry', async () => {
  let reads = 0, clock = 0; const model = createAiRetry({ get: async () => { reads++; return record; } }, { enabled: true, now: () => clock });
  await model.prepare(record); model.state.accepted = true; await model.refresh(); assert.equal(reads, 1);
  clock = 5000; await model.refresh(); assert.equal(reads, 2); assert.equal(model.state.ready, false); assert.equal(model.state.accepted, false);
});
test('network/403/404/422/invalid success all disarm; failed lookup cannot enable retry', async () => {
  for (const status of [null, 403, 404, 422, 409]) {
    let failed = false; const model = createAiRetry({ get: async () => { if (failed) throw Error(); return record; }, post: async () => { failed = true; throw { status }; } }, { enabled: true });
    await model.prepare(record); model.state.accepted = true; await model.submit(); assert.equal(model.state.ready, false); assert.equal(model.state.accepted, false);
  }
  const bad = createAiRetry({ get: async () => record, post: async () => ({ ...queued, id: 'other' }) }, { enabled: true });
  await bad.prepare(record); bad.state.accepted = true; await bad.submit(); assert.equal(bad.state.record.ai_status, 'failed'); assert.equal(bad.state.ready, false); assert.match(bad.state.error, /不确定/);
});
test('latest confirmation or nonteacher response prevents retry; late responses after unmount are ignored', async () => {
  for (const data of [{ ...record, status: 'confirmed' }, { ...record, view: 'student' }]) {
    const model = createAiRetry({ get: async () => data }, { enabled: true }); await model.prepare(record); assert.equal(model.state.ready, false);
  }
  let resolve, updates = 0; const model = createAiRetry({ get: () => new Promise(done => { resolve = done; }) }, { enabled: true, onRead: () => updates++ });
  const pending = model.prepare(record); model.dispose(); resolve(record); await pending; assert.equal(updates, 0); assert.equal(model.state.record, null);
});
