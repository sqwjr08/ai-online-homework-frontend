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
const groups = [
  { id: 'class-demo', name: '虚构一班', code: 'ABC123', teacher_id: 'fixture-teacher', is_active: true, created_at: '2030-01-01T00:00:00Z' },
  { id: 'class-archived', name: '虚构归档班', code: 'OLD123', teacher_id: 'fixture-teacher', is_active: false, created_at: '2030-01-01T00:00:00Z' },
];
for (const user of accounts) if (user.role === 'student') user.class_id = 'class-demo';
const questions = Array.from({ length: 26 }, (_, i) => ({ id: `question-${i}`, prompt: `虚构题目${i + 1}：解释索引的用途。`,
  reference_answer: '虚构参考答案：加速检索。', rubric: i % 2 ? '说明用途得分。' : null, max_score: 10, image_urls: [],
  created_by: 'fixture-teacher', is_active: i !== 25, created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z' }));
// In-memory image transport only; Pillow validation/re-encoding remains a backend check.
const images = new Map();
const lockedQuestions = new Set(['question-0']);
const assignments = [{ id: 'draft-0', title: '虚构草稿示例', description: null, class_id: 'class-demo',
  questions: [{ question_id: 'question-0' }], due_at: null, status: 'draft', created_by: 'fixture-teacher', created_at: '2030-01-01T00:00:00Z' }];
function assignmentRead(item) {
  return { ...item, view: 'teacher', question_source: 'draft_preview', questions: item.questions.map(({ question_id }, index) => {
    const q = questions.find(q => q.id === question_id);
    return { question_id, position: index + 1, prompt: q.prompt, reference_answer: q.reference_answer, rubric: q.rubric, max_score: q.max_score, image_urls: q.image_urls };
  }) };
}
const api = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', chunk => { chunks.push(chunk); });
  req.on('end', () => {
    const raw = Buffer.concat(chunks), body = raw.toString('utf8');
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (mode === 'offline') return send(503, { detail: 'Fixture temporarily unavailable' });
    const issued = tokens.get(req.headers.authorization?.replace('Bearer ', ''));
    const actor = issued && accounts.find(user => user.id === issued.id && user.is_active && credentials.get(user.id)?.version === issued.version);
    if (req.method === 'GET' && images.has(req.url)) {
      const image = images.get(req.url); res.writeHead(200, { 'Content-Type': image.type }); return res.end(image.bytes);
    }
    if (req.url === '/api/v1/uploads/images' && req.method === 'POST') {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (!['teacher', 'admin'].includes(actor.role)) return send(403, { detail: 'Teacher required' });
      const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(req.headers['content-type'] ?? '');
      if (!boundary) return send(422, { detail: 'Multipart file required' });
      const headerEnd = raw.indexOf('\r\n\r\n'), header = raw.subarray(0, headerEnd).toString('utf8');
      if (headerEnd < 0 || !header.includes('name="file"')) return send(422, { detail: 'File field required' });
      const type = /Content-Type: (image\/(?:jpeg|png))\r?$/im.exec(header)?.[1];
      if (!type) return send(415, { detail: 'Only JPEG and PNG' });
      const end = raw.indexOf(Buffer.from(`\r\n--${boundary[1] ?? boundary[2]}`), headerEnd + 4);
      if (end < 0) return send(400, { detail: 'Incomplete upload' });
      const bytes = raw.subarray(headerEnd + 4, end);
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return send(413, { detail: 'Image byte limit' });
      const url = `/uploads/images/fixture-${images.size}.${type === 'image/png' ? 'png' : 'jpg'}`;
      images.set(url, { type, bytes }); return send(200, { url });
    }
    if (req.url === '/api/v1/auth/register' && req.method === 'POST') {
      const data = JSON.parse(body);
      if (Object.keys(data).some(key => !['username', 'password'].includes(key)) || typeof data.username !== 'string'
        || [...data.username].length < 3 || [...data.username].length > 50 || /[\s\p{C}]/u.test(data.username)
        || typeof data.password !== 'string' || [...data.password].length < 4 || [...data.password].length > 128 || !data.password.trim())
        return send(422, { detail: 'Invalid student registration' });
      if (accounts.some(user => user.username === data.username)) return send(409, { detail: 'Username already exists' });
      const user = { id: `fictional-${accounts.length}`, username: data.username, role: 'student', is_active: true, class_id: null, created_at: new Date().toISOString() };
      accounts.unshift(user); credentials.set(user.id, { hash: hash(data.password), version: 0 });
      return send(201, user);
    }
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
    if (url.pathname.startsWith('/api/v1/assignments')) {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      const owns = item => groups.some(g => g.id === item.class_id && g.teacher_id === actor.id);
      if (url.pathname === '/api/v1/assignments/my' && req.method === 'GET') return send(200, assignments.filter(item => owns(item) && (!url.searchParams.has('status') || item.status === url.searchParams.get('status'))).map(assignmentRead));
      const target = assignments.find(item => url.pathname === `/api/v1/assignments/${item.id}`);
      if (target && !owns(target)) return send(403, { detail: 'Forbidden' });
      if (target && req.method === 'GET') return send(200, assignmentRead(target));
      const creating = url.pathname === '/api/v1/assignments' && req.method === 'POST';
      if (creating || (target && req.method === 'PATCH')) {
        const data = JSON.parse(body), classId = creating ? data.class_id : target.class_id;
        const group = groups.find(g => g.id === classId && g.is_active);
        if (!group) return send(creating ? 404 : 409, { detail: 'Class unavailable or archived' });
        if (group.teacher_id !== actor.id) return send(403, { detail: 'Class ownership required' });
        if (!creating && target.status !== 'draft') return send(409, { detail: 'Only drafts can be edited' });
        if ((creating && data.status !== 'draft') || (!creating && ('class_id' in data || 'status' in data))) return send(422, { detail: 'Draft fixture accepts only draft creation and content updates' });
        if (typeof data.title !== 'string' || !data.title.trim() || [...data.title.trim()].length > 200) return send(422, { detail: 'Invalid title' });
        const ids = data.questions?.map(q => q.question_id) ?? [];
        if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !questions.some(q => q.id === id && q.is_active))) return send(400, { detail: 'Invalid questions' });
        if (ids.some(id => questions.find(q => q.id === id).created_by !== actor.id)) return send(403, { detail: 'Question ownership required' });
        if (data.due_at && (!Number.isFinite(new Date(data.due_at).getTime()) || !/(Z|[+-]\d\d:\d\d)$/.test(data.due_at))) return send(422, { detail: 'Timezone required' });
        ids.forEach(id => lockedQuestions.add(id));
        const changes = { title: data.title.trim(), description: data.description ?? null, questions: ids.map(question_id => ({ question_id })), due_at: data.due_at ?? null };
        if (creating) {
          const item = { ...changes, id: `draft-${assignments.length}`, class_id: classId, status: 'draft', created_by: actor.id, created_at: new Date().toISOString() };
          assignments.unshift(item); return send(201, assignmentRead(item));
        }
        Object.assign(target, changes); return send(200, assignmentRead(target));
      }
      return send(404, { detail: 'Assignment fixture route not found' });
    }
    if (url.pathname.startsWith('/api/v1/questions')) {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      if (url.pathname === '/api/v1/questions' && req.method === 'GET') {
        const q = url.searchParams, page = Number(q.get('page') || 1), page_size = Number(q.get('page_size') || 20);
        const matched = questions.filter(item => item.created_by === actor.id && item.is_active === (q.get('is_active') !== 'false')
          && item.prompt.toLowerCase().includes((q.get('q') || '').trim().toLowerCase()));
        return send(200, { items: matched.slice((page - 1) * page_size, page * page_size), total: matched.length, page, page_size });
      }
      if (url.pathname === '/api/v1/questions' && req.method === 'POST') {
        const data = JSON.parse(body);
        if (typeof data.prompt !== 'string' || !data.prompt.trim() || [...data.prompt.trim()].length > 10000
          || typeof data.reference_answer !== 'string' || !data.reference_answer.trim() || [...data.reference_answer.trim()].length > 20000
          || typeof data.max_score !== 'number' || !Number.isFinite(data.max_score) || data.max_score <= 0
          || (data.rubric != null && (typeof data.rubric !== 'string' || !data.rubric.trim() || [...data.rubric.trim()].length > 5000)))
          return send(422, { detail: 'Invalid fixture question input' });
        const question = { id: `question-${questions.length}`, prompt: data.prompt.trim(), reference_answer: data.reference_answer.trim(),
          max_score: data.max_score, rubric: data.rubric?.trim() ?? null, image_urls: data.image_urls ?? [], is_active: true, created_by: actor.id,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        questions.unshift(question); return send(201, question);
      }
      const question = questions.find(item => url.pathname === `/api/v1/questions/${item.id}`);
      if (req.method === 'GET' && question) return question.created_by === actor.id ? send(200, question) : send(403, { detail: 'Forbidden' });
      const target = question ?? questions.find(item => url.pathname === `/api/v1/questions/${item.id}/disable`);
      const disabling = target && url.pathname.endsWith('/disable') && req.method === 'POST';
      if (target && (disabling || (question && req.method === 'PATCH'))) {
        if (target.created_by !== actor.id) return send(403, { detail: 'Forbidden' });
        if (disabling && !target.is_active) return send(200, target);
        if (!target.is_active) return send(409, { detail: 'Question is disabled' });
        // The fixture keeps the lock private, like the real QuestionRead response.
        if (lockedQuestions.has(target.id)) return send(409, { detail: 'Question content is locked; create a new question' });
        if (disabling) target.is_active = false;
        else {
          const data = JSON.parse(body);
          if (typeof data.prompt !== 'string' || !data.prompt.trim() || [...data.prompt.trim()].length > 10000
            || typeof data.reference_answer !== 'string' || !data.reference_answer.trim() || [...data.reference_answer.trim()].length > 20000
            || typeof data.max_score !== 'number' || !Number.isFinite(data.max_score) || data.max_score <= 0
            || (data.rubric != null && (typeof data.rubric !== 'string' || !data.rubric.trim() || [...data.rubric.trim()].length > 5000)))
            return send(422, { detail: 'Invalid fixture question input' });
          Object.assign(target, { prompt: data.prompt.trim(), reference_answer: data.reference_answer.trim(), max_score: data.max_score, rubric: data.rubric?.trim() ?? null });
          if (Array.isArray(data.image_urls)) target.image_urls = [...data.image_urls];
        }
        target.updated_at = new Date().toISOString(); return send(200, target);
      }
      return send(404, { detail: 'Question fixture route not found' });
    }
    if (url.pathname.startsWith('/api/v1/classes')) {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (url.pathname === '/api/v1/classes/my' && req.method === 'GET' && actor.role === 'student')
        return send(200, groups.filter(group => group.id === actor.class_id));
      if (url.pathname === '/api/v1/classes/join' && req.method === 'POST') {
        if (actor.role !== 'student') return send(403, { detail: 'Student required' });
        const code = JSON.parse(body).code?.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code || '')) return send(422, { detail: 'Invalid class code' });
        const group = groups.find(group => group.code === code && group.is_active);
        if (!group) return send(404, { detail: 'Active class not found' });
        if (actor.class_id && actor.class_id !== group.id) return send(409, { detail: 'Student already belongs to another class' });
        actor.class_id = group.id; return send(200, group);
      }
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      if (url.pathname === '/api/v1/classes/my' && req.method === 'GET') {
        return send(200, groups.filter(group => group.teacher_id === actor.id && (!url.searchParams.has('is_active') || group.is_active === (url.searchParams.get('is_active') === 'true'))));
      }
      if (url.pathname === '/api/v1/classes' && req.method === 'POST') {
        const data = JSON.parse(body), name = data.name?.trim();
        if (!name || [...name].length > 100) return send(422, { detail: 'Invalid class name' });
        const group = { id: `class-${groups.length}`, name, code: `C${String(groups.length).padStart(5, '0')}`, teacher_id: actor.id, is_active: true, created_at: new Date().toISOString() };
        groups.unshift(group); return send(201, group);
      }
      const match = url.pathname.match(/^\/api\/v1\/classes\/([^/]+)\/(members|archive)$/);
      if (match) {
        const group = groups.find(group => group.id === match[1]);
        if (!group) return send(404, { detail: 'Class not found' });
        if (group.teacher_id !== actor.id) return send(403, { detail: 'Forbidden' });
        if (match[2] === 'archive' && req.method === 'POST') { group.is_active = false; return send(200, group); }
        if (match[2] === 'members' && req.method === 'GET') {
          const q = url.searchParams, page = Number(q.get('page') || 1), page_size = Number(q.get('page_size') || 20);
          const items = accounts.filter(user => user.role === 'student' && user.class_id === group.id && (!q.has('is_active') || user.is_active === (q.get('is_active') === 'true')));
          return send(200, { items: items.slice((page - 1) * page_size, page * page_size), page, page_size, total: items.length });
        }
      }
      return send(404, { detail: 'Class fixture route not found' });
    }
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
