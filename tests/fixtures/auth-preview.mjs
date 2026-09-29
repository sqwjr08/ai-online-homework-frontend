// Explicit test-only browser fixture. Never imported into app or normal dev startup.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createDevProxy } from '../../config/dev-proxy.js';

let mode = 'online';
const users = { teacher_demo: 'teacher', student_demo: 'student', admin_demo: 'admin' };
// Fictional account list only; never read a database or retain submitted passwords.
const accounts = Array.from({ length: 25 }, (_, i) => ({ id: `fixture-user-${i}`, username: `student_${String(i + 1).padStart(2, '0')}`,
  role: i % 3 === 0 ? 'teacher' : 'student', is_active: i % 4 !== 0, class_id: null, created_at: '2030-01-01T00:00:00Z' }));
accounts.unshift(...Object.entries(users).map(([username, role]) => ({ id: `fixture-${role}`, username, role, is_active: true, class_id: null, created_at: '2030-01-02T00:00:00Z' })));
// Test-only hashes, not a production password hashing implementation.
const hash = value => createHash('sha256').update(value).digest('hex');
const credentials = new Map(accounts.map(user => [user.id, { hash: hash('demo-pass'), version: 0 }]));
const tokens = new Map();
let nextToken = 0;
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (mode === 'offline') return send(503, { detail: 'Fixture temporarily unavailable' });
    const issued = tokens.get(req.headers.authorization?.replace('Bearer ', ''));
    const actor = issued && accounts.find(user => user.id === issued.id && user.is_active && credentials.get(user.id)?.version === issued.version);
    if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
      const data = JSON.parse(body);
      if (data.username === 'disabled_demo') return send(403, { detail: 'User is disabled' });
      const user = accounts.find(user => user.username === data.username);
      if (!user || credentials.get(user.id)?.hash !== hash(data.password)) return send(401, { detail: 'Invalid credentials' });
      if (!user.is_active) return send(403, { detail: 'User is disabled' });
      const token = `fixture-session-${++nextToken}`;
      tokens.set(token, { id: user.id, version: credentials.get(user.id).version });
      return send(200, { access_token: token, token_type: 'bearer' });
    }
    if (req.url === '/api/v1/auth/me') {
      if (mode === 'expired' || !actor) return send(401, { detail: 'Token revoked' });
      return send(200, actor);
    }
    if (req.url === '/api/v1/auth/logout') return send(200, { message: 'Discard token' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/v1/users')) {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (actor.role !== 'admin') return send(403, { detail: 'Administrator required' });
    }
    const maintenance = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/(status|reset-password)$/);
    if (maintenance) {
      const user = accounts.find(user => user.id === maintenance[1]);
      if (!user) return send(404, { detail: 'User not found' });
      if (user.role === 'admin') return send(403, { detail: 'Administrator accounts are protected' });
      const data = JSON.parse(body);
      const auth = credentials.get(user.id);
      if (maintenance[2] === 'status' && req.method === 'PATCH' && typeof data.is_active === 'boolean') {
        if (user.is_active !== data.is_active) { user.is_active = data.is_active; auth.version++; }
      } else if (maintenance[2] === 'reset-password' && req.method === 'POST' && typeof data.password === 'string'
        && [...data.password].length >= 4 && [...data.password].length <= 128 && data.password.trim()) {
        auth.hash = hash(data.password); auth.version++;
      } else return send(422, { detail: 'Invalid fixture input' });
      return send(200, user);
    }
    if (url.pathname === '/api/v1/users') {
      if (req.method === 'GET') {
        const q = url.searchParams;
        const matched = accounts.filter(user => (!q.has('username') || user.username.toLowerCase().includes(q.get('username').toLowerCase()))
          && (!q.has('role') || user.role === q.get('role')) && (!q.has('is_active') || user.is_active === (q.get('is_active') === 'true')));
        const page = Number(q.get('page') || 1), page_size = Number(q.get('page_size') || 20);
        return send(200, { items: matched.slice((page - 1) * page_size, page * page_size), total: matched.length, page, page_size });
      }
      if (req.method === 'POST') {
        const data = JSON.parse(body);
        if (accounts.some(user => user.username === data.username)) return send(409, { detail: 'Username already exists' });
        if (!['teacher', 'student'].includes(data.role)) return send(400, { detail: 'Cannot create admin here' });
        if (data.username === 'validation_demo') return send(422, { detail: [{ loc: ['body', 'username'], msg: 'Fixture validation failure' }] });
        const user = { id: `fictional-${accounts.length}`, username: data.username, role: data.role, is_active: data.is_active,
          class_id: null, created_at: new Date().toISOString() };
        accounts.unshift(user);
        credentials.set(user.id, { hash: hash(data.password), version: 0 });
        if (data.username === 'uncertain_demo') return send(503, { detail: 'Fixture saved but response failed' });
        return send(201, user);
      }
    }
    send(404, { detail: 'Fixture route not found' });
  });
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const vite = await createServer({ configFile: false, envDir: false, plugins: [vue()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: createDevProxy(`http://127.0.0.1:${api.address().port}`) } });
await vite.listen();
console.log('Fictional auth preview: http://127.0.0.1:5174 ; commands: offline / online / expired / stop');
async function stop() { await vite.close(); await new Promise(resolve => api.close(resolve)); process.exit(0); }
process.stdin.on('data', data => {
  const command = data.toString().trim();
  if (command === 'stop') void stop();
  else if (['offline', 'online', 'expired'].includes(command)) { mode = command; console.log(`Fixture mode: ${mode}`); }
});
process.on('SIGINT', stop);
