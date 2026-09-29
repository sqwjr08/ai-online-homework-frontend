import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from 'vite';
import { createDevProxy } from '../config/dev-proxy.js';

function request(port, path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('proxy accepts only an HTTP(S) origin without credentials', () => {
  assert.equal(createDevProxy()['^/api/v1(?:/|\\?|$)'].target, 'http://127.0.0.1:8000');
  for (const value of ['ftp://localhost', 'http://user:password@localhost', 'http://localhost/api/v1', 'http://localhost?q=1']) {
    assert.throws(() => createDevProxy(value));
  }
});

test('real local HTTP proxy preserves paths, queries, bearer, POST body/status and upload paths', async () => {
  // A fictional in-process server only; never contacts the actual API/database/worker.
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/api/v1/redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1:1/never-follow' });
        res.end();
        return;
      }
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, auth: req.headers.authorization, body }));
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let vite;
  try {
    vite = await createServer({
      configFile: false, envFile: false, envDir: false, appType: 'custom', logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, strictPort: true, proxy: createDevProxy(`http://127.0.0.1:${upstream.address().port}`) },
    });
    await vite.listen();
    const port = vite.httpServer.address().port;
    const result = await request(port, '/api/v1/questions?q=test&page=2', { headers: { Authorization: 'Bearer fictional' } });
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.data).path, '/api/v1/questions?q=test&page=2');
    assert.equal(JSON.parse(result.data).auth, 'Bearer fictional');
    const body = JSON.stringify({ answers: [{ question_id: 'fictional', answer_text: '虚构文字' }] });
    const saved = await request(port, '/api/v1/assignments/example/submissions', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    assert.equal(saved.status, 201);
    assert.equal(JSON.parse(saved.data).body, body);
    assert.equal(JSON.parse((await request(port, '/uploads/images/example.png')).data).path, '/uploads/images/example.png');
    assert.equal((await request(port, '/api/v10/not-an-endpoint')).status, 404);
    const redirect = await request(port, '/api/v1/redirect');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, undefined);
    await new Promise(resolve => upstream.close(resolve));
    assert.equal((await request(port, '/api/v1/auth/me')).status, 502);
  } finally {
    await vite?.close();
    if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
  }
});
