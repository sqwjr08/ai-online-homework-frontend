// Explicit test-only browser fixture. Never imported into app or normal dev startup.
import http from 'node:http';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createDevProxy } from '../../config/dev-proxy.js';

let mode = 'online';
const users = { teacher_demo: 'teacher', student_demo: 'student', admin_demo: 'admin' };
// Fictional account list only; never read a database or retain submitted passwords.
const accounts = Array.from({ length: 25 }, (_, i) => ({ id: `fixture-user-${i}`, username: `student_${String(i + 1).padStart(2, '0')}`,
  role: i % 3 === 0 ? 'teacher' : 'student', is_active: i % 4 !== 0, class_id: null, created_at: '2030-01-01T00:00:00Z' }));
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (mode === 'offline') return send(503, { detail: 'Fixture temporarily unavailable' });
    if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
      const data = JSON.parse(body);
      if (data.username === 'disabled_demo') return send(403, { detail: 'User is disabled' });
      if (!users[data.username] || data.password !== 'demo-pass') return send(401, { detail: 'Invalid credentials' });
      return send(200, { access_token: `fixture-${users[data.username]}`, token_type: 'bearer' });
    }
    if (req.url === '/api/v1/auth/me') {
      const role = req.headers.authorization?.replace('Bearer fixture-', '');
      if (mode === 'expired' || !Object.values(users).includes(role)) return send(401, { detail: 'Token revoked' });
      return send(200, { id: `fixture-${role}`, username: `${role}_demo`, role, is_active: true, class_id: null, created_at: '2030-01-01T00:00:00Z' });
    }
    if (req.url === '/api/v1/auth/logout') return send(200, { message: 'Discard token' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/v1/users') {
      if (req.headers.authorization !== 'Bearer fixture-admin') return send(403, { detail: 'Administrator required' });
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
