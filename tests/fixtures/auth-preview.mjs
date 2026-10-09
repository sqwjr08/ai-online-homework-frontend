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
const studentSubmissions = new Map();
const lockedQuestions = new Set(['question-0']);
const assignments = [{ id: 'draft-0', title: '虚构草稿示例', description: null, class_id: 'class-demo',
  questions: [{ question_id: 'question-0' }], due_at: null, status: 'draft', created_by: 'fixture-teacher', created_at: '2030-01-01T00:00:00Z' }];
function assignmentRead(item) {
  const { snapshot, archived_from, ...common } = item;
  return { ...common, view: 'teacher', question_source: snapshot ? 'snapshot' : item.status === 'draft' || archived_from === 'draft' ? 'draft_preview' : 'legacy_reference', questions: snapshot ?? item.questions.map(({ question_id }, index) => {
    const q = questions.find(q => q.id === question_id);
    return { question_id, position: index + 1, prompt: q.prompt, reference_answer: q.reference_answer, rubric: q.rubric, max_score: q.max_score, image_urls: q.image_urls };
  }) };
}
assignments.push({ ...assignments[0], id: 'published-0', title: '虚构已发布快照', status: 'published', snapshot: structuredClone(assignmentRead(assignments[0]).questions) },
  { ...assignments[0], id: 'open-0', title: '虚构可作答作业', status: 'published', snapshot: structuredClone(assignmentRead(assignments[0]).questions) },
  { ...assignments[0], id: 'expired-0', title: '虚构已截止作业（仍可读取）', status: 'published', due_at: '2000-01-01T00:00:00Z', snapshot: structuredClone(assignmentRead(assignments[0]).questions) },
  { ...assignments[0], id: 'legacy-0', title: '虚构旧引用作业', status: 'published' },
  { ...assignments[0], id: 'archived-0', title: '虚构已归档草稿', status: 'archived', archived_from: 'draft' });
// Fictional teacher review records only: no model calls, worker or persisted data.
const reviewRecords = Array.from({ length: 25 }, (_, i) => {
  const confirmed = i % 4 === 0, ai = ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'legacy_unknown'][i % 6];
  return { id: `review-${i}`, view: 'teacher', assignment_id: 'published-0', student_id: `fictional-review-student-${i}`,
    status: confirmed ? 'confirmed' : 'pending_teacher_review', ai_status: ai, ai_attempts: ai === 'pending' ? 0 : 1,
    ai_retry_count: 0, ai_next_attempt_at: null, ai_error_code: ai === 'failed' ? 'timeout' : null,
    ai_total_score: ai === 'succeeded' ? 0 : null, final_total_score: confirmed ? 0 : null,
    submitted_at: `2030-01-01T01:${String(i).padStart(2, '0')}:00Z`, reviewed_by: confirmed ? 'fixture-teacher' : null,
    reviewed_at: confirmed ? '2030-01-01T02:00:00Z' : null,
    answers: [{ question_id: 'question-0', answer_text: `虚构答案${i + 1}：索引用于检索。\n第二行原文。`, ai_score: ai === 'succeeded' ? 0 : null,
      ai_comment: ai === 'succeeded' ? '虚构评分草稿，不是真实AI调用。' : null, final_score: confirmed ? 0 : null, final_comment: confirmed ? '虚构教师评语。' : null }] };
});
const confirmedRecords = new Map();
assignments.push({ ...assignments.find(a => a.id === 'published-0'), id: 'history-0', title: '虚构归档历史作业', status: 'archived', archived_from: 'published' });
reviewRecords.push({ ...reviewRecords[0], id: 'history-submission', assignment_id: 'history-0', student_id: 'fixture-student' });
function studentRecord(record) {
  const confirmed = record.status === 'confirmed';
  return { view: 'student', id: record.id, assignment_id: record.assignment_id, student_id: record.student_id, status: record.status,
    submitted_at: record.submitted_at, final_total_score: confirmed ? record.final_total_score : null,
    reviewed_at: confirmed ? record.reviewed_at : null, reviewed_by: confirmed ? record.reviewed_by : null,
    answers: record.answers.map(answer => ({ question_id: answer.question_id, answer_text: answer.answer_text,
      final_score: confirmed ? answer.final_score : null, final_comment: confirmed ? answer.final_comment : null })) };
}
function teacherRecords() {
  const historical = ['published-0', 'legacy-0'].map(assignment_id => ({ ...reviewRecords[0], id: `submission-fixture-student-${assignment_id}`,
    assignment_id, student_id: 'fixture-student', answers: [], status: assignment_id === 'published-0' ? 'confirmed' : 'pending_teacher_review',
    ai_status: 'legacy_unknown', ai_total_score: null, final_total_score: assignment_id === 'published-0' ? 8 : null,
    reviewed_by: assignment_id === 'published-0' ? 'fixture-teacher' : null, reviewed_at: assignment_id === 'published-0' ? '2030-01-01T02:00:00Z' : null }));
  return [...reviewRecords, ...historical, ...[...studentSubmissions.values()].map(item => ({ ...item, view: 'teacher', ai_status: 'pending', ai_attempts: 0,
    ai_retry_count: 0, ai_next_attempt_at: null, ai_error_code: null, ai_total_score: null,
    answers: item.answers.map(answer => ({ ...answer, ai_score: null, ai_comment: null })) }))].map(item => confirmedRecords.get(item.id) ?? item);
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
    const retryMatch = /^\/api\/v1\/submissions\/([^/]+)\/retry-grading$/.exec(url.pathname);
    if (retryMatch && req.method === 'POST') {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      const record = teacherRecords().find(item => item.id === retryMatch[1]);
      if (!record) return send(404, { detail: 'Submission not found' });
      const assignment = assignments.find(item => item.id === record.assignment_id);
      if (!groups.some(group => group.id === assignment?.class_id && group.teacher_id === actor.id)) return send(403, { detail: 'Forbidden' });
      const data = JSON.parse(body), count = data.expected_retry_count;
      if (Object.keys(data).some(key => key !== 'expected_retry_count') || !Number.isInteger(count) || count < 0 || count > 2147483647) return send(422, { detail: 'Invalid retry count' });
      if (record.status !== 'pending_teacher_review' || record.ai_status !== 'failed' || record.ai_retry_count !== count) return send(409, { detail: 'Retry status or count changed' });
      const result = { ...record, ai_status: 'pending', ai_retry_count: count + 1, ai_next_attempt_at: new Date(Date.now() + 5000).toISOString() };
      // Reuse the in-memory submission overlay; no worker or provider is invoked.
      confirmedRecords.set(result.id, result); return send(202, result);
    }
    const confirmMatch = /^\/api\/v1\/submissions\/([^/]+)\/confirm-grade$/.exec(url.pathname);
    if (confirmMatch && req.method === 'POST') {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      const record = teacherRecords().find(item => item.id === confirmMatch[1]);
      if (!record) return send(404, { detail: 'Submission not found' });
      const assignment = assignments.find(item => item.id === record.assignment_id);
      if (!groups.some(group => group.id === assignment?.class_id && group.teacher_id === actor.id)) return send(403, { detail: 'Forbidden' });
      if (record.status !== 'pending_teacher_review' || assignment.status === 'draft' || assignment.archived_from === 'draft') return send(409, { detail: 'Grade locked or assignment not published' });
      const questions = assignmentRead(assignment).questions, ids = questions.map(q => q.question_id), answerIds = record.answers.map(a => a.question_id);
      if (!ids.length || new Set(answerIds).size !== ids.length || answerIds.length !== ids.length || answerIds.some(id => !ids.includes(id))) return send(409, { detail: 'Submission questions require repair' });
      const data = JSON.parse(body), grades = data.grades;
      if (Object.keys(data).some(key => key !== 'grades') || !Array.isArray(grades) || !grades.length || grades.some(g => Object.keys(g).some(key => !['question_id', 'final_score', 'final_comment'].includes(key)) || typeof g.final_score !== 'number' || !Number.isFinite(g.final_score) || g.final_score < 0 || Math.abs(g.final_score * 100 - Math.round(g.final_score * 100)) > 0.000001 || (g.final_comment != null && (typeof g.final_comment !== 'string' || [...g.final_comment].length > 1000)))) return send(422, { detail: 'Invalid grades' });
      if (grades.length !== ids.length || new Set(grades.map(g => g.question_id)).size !== ids.length || grades.some(g => !ids.includes(g.question_id) || g.final_score > questions.find(q => q.question_id === g.question_id).max_score)) return send(400, { detail: 'Grades mismatch or out of range' });
      const result = { ...record, status: 'confirmed', final_total_score: grades.reduce((sum, g) => sum + Math.round(g.final_score * 100), 0) / 100,
        reviewed_at: new Date().toISOString(), reviewed_by: actor.id, ai_next_attempt_at: null,
        ai_status: ['pending', 'processing', 'failed'].includes(record.ai_status) ? 'cancelled' : record.ai_status,
        answers: record.answers.map(answer => { const grade = grades.find(g => g.question_id === answer.question_id); return { ...answer, final_score: grade.final_score, final_comment: grade.final_comment?.trim() || null }; }) };
      confirmedRecords.set(result.id, result);
      const key = `${result.student_id}:${result.assignment_id}`;
      if (studentSubmissions.has(key)) studentSubmissions.set(key, { ...studentSubmissions.get(key), status: result.status, final_total_score: result.final_total_score,
        reviewed_at: result.reviewed_at, reviewed_by: result.reviewed_by, answers: result.answers.map(({ question_id, answer_text, final_score, final_comment }) => ({ question_id, answer_text, final_score, final_comment })) });
      return send(200, result);
    }
    const reviewMatch = /^\/api\/v1\/submissions\/([^/]+)$/.exec(url.pathname);
    if (reviewMatch && req.method === 'GET') {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      const record = teacherRecords().find(item => item.id === reviewMatch[1]);
      if (!record) return send(404, { detail: 'Submission not found' });
      if (actor.role === 'student') return record.student_id === actor.id ? send(200, studentRecord(record)) : send(403, { detail: 'Forbidden' });
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      const assignment = assignments.find(item => item.id === record.assignment_id);
      if (!groups.some(group => group.id === assignment?.class_id && group.teacher_id === actor.id)) return send(403, { detail: 'Forbidden' });
      return send(200, record);
    }
    if (url.pathname.startsWith('/api/v1/assignments')) {
      if (!actor || mode === 'expired') return send(401, { detail: 'Token revoked' });
      const submitMatch = /^\/api\/v1\/assignments\/([^/]+)\/submissions$/.exec(url.pathname);
      if (submitMatch && req.method === 'POST') {
        if (actor.role !== 'student') return send(403, { detail: 'Students only' });
        const item = assignments.find(item => item.id === submitMatch[1]);
        if (!item || item.status !== 'published') return send(404, { detail: 'Assignment not found' });
        if (item.class_id !== actor.class_id) return send(403, { detail: 'Forbidden' });
        if (!groups.find(g => g.id === item.class_id)?.is_active) return send(409, { detail: 'Class archived' });
        if (item.due_at && new Date(item.due_at).getTime() <= Date.now()) return send(400, { detail: 'Assignment is closed' });
        const key = `${actor.id}:${item.id}`;
        if (studentSubmissions.has(key) || (actor.id === 'fixture-student' && ['published-0', 'legacy-0'].includes(item.id))) return send(409, { detail: 'Assignment already submitted' });
        const answers = JSON.parse(body).answers;
        if (!Array.isArray(answers) || answers.some(a => typeof a.answer_text !== 'string' || !a.answer_text.trim() || [...a.answer_text].length > 20000)) return send(422, { detail: 'Invalid answer' });
        if (answers.length !== item.questions.length || new Set(answers.map(a => a.question_id)).size !== answers.length || answers.some(a => !item.questions.some(q => q.question_id === a.question_id))) return send(400, { detail: 'Answer mismatch' });
        const result = { view: 'student', id: `submission-${studentSubmissions.size}`, assignment_id: item.id, student_id: actor.id,
          status: 'pending_teacher_review', submitted_at: new Date().toISOString(), answers: answers.map(a => ({ question_id: a.question_id, answer_text: a.answer_text, final_score: null, final_comment: null })), final_total_score: null, reviewed_by: null, reviewed_at: null };
        studentSubmissions.set(key, result); return send(201, result);
      }
      if (actor.role === 'student' && req.method === 'GET') {
        const studentRead = item => {
          const data = assignmentRead(item);
          return { id: data.id, title: data.title, description: data.description, class_id: data.class_id, due_at: data.due_at,
            status: data.status, view: 'student', question_source: data.question_source, created_by: data.created_by, created_at: data.created_at,
            questions: data.questions.map(q => ({ question_id: q.question_id, position: q.position, prompt: q.prompt, image_urls: q.image_urls, max_score: q.max_score })) };
        };
        const mine = /^\/api\/v1\/assignments\/([^/]+)\/submissions\/my$/.exec(url.pathname);
        if (mine) {
          const own = teacherRecords().find(record => record.student_id === actor.id && record.assignment_id === mine[1]);
          return own ? send(200, studentRecord(own)) : send(404, { detail: 'Submission not found' });
        }
        if (url.pathname === '/api/v1/assignments/my') return send(200, assignments.filter(item => item.class_id === actor.class_id && item.status === 'published' && (!url.searchParams.has('status') || url.searchParams.get('status') === 'published')).map(studentRead));
        const item = assignments.find(item => url.pathname === `/api/v1/assignments/${item.id}`);
        if (!item) return send(404, { detail: 'Assignment not found' });
        if (item.class_id !== actor.class_id) return send(403, { detail: 'Forbidden' });
        return item.status === 'published' ? send(200, studentRead(item)) : send(404, { detail: 'Assignment not found' });
      }
      if (actor.role !== 'teacher') return send(403, { detail: 'Teacher fixture only' });
      const owns = item => groups.some(g => g.id === item.class_id && g.teacher_id === actor.id);
      if (submitMatch && req.method === 'GET') {
        const assignment = assignments.find(item => item.id === submitMatch[1]);
        if (!assignment) return send(404, { detail: 'Assignment not found' });
        if (!owns(assignment)) return send(403, { detail: 'Forbidden' });
        const page = Number(url.searchParams.get('page') ?? 1), size = Number(url.searchParams.get('page_size') ?? 20), status = url.searchParams.get('status');
        if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(size) || size < 1 || size > 100 || (status && !['confirmed', 'pending_teacher_review'].includes(status))) return send(422, { detail: 'Invalid pagination or status' });
        const all = teacherRecords().filter(item => item.assignment_id === assignment.id).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id));
        const items = all.filter(item => !status || item.status === status);
        return send(200, { items: items.slice((page - 1) * size, page * size), total: items.length, page, page_size: size,
          progress: { submitted_count: all.length, pending_count: all.filter(item => item.status === 'pending_teacher_review').length, confirmed_count: all.filter(item => item.status === 'confirmed').length } });
      }
      if (url.pathname === '/api/v1/assignments/my' && req.method === 'GET') return send(200, assignments.filter(item => owns(item) && (!url.searchParams.has('status') || item.status === url.searchParams.get('status'))).map(assignmentRead));
      const operation = /^\/api\/v1\/assignments\/([^/]+)\/(publish|archive)$/.exec(url.pathname);
      if (operation && req.method === 'POST') {
        const item = assignments.find(item => item.id === operation[1]);
        if (!item) return send(404, { detail: 'Assignment not found' });
        if (!owns(item)) return send(403, { detail: 'Forbidden' });
        if (operation[2] === 'publish') {
          if (!groups.find(g => g.id === item.class_id)?.is_active) return send(409, { detail: 'Class is archived' });
          if (item.status === 'published') return send(200, assignmentRead(item));
          if (item.status !== 'draft') return send(409, { detail: 'Only drafts can be published' });
          if (item.due_at && new Date(item.due_at).getTime() <= Date.now()) return send(400, { detail: 'Assignment is closed' });
          if (item.questions.some(row => !questions.find(q => q.id === row.question_id && q.is_active))) return send(400, { detail: 'Invalid questions' });
          item.snapshot = structuredClone(assignmentRead(item).questions);
          item.status = 'published';
        } else if (item.status !== 'archived') { item.archived_from = item.status; item.status = 'archived'; }
        return send(200, assignmentRead(item));
      }
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
  define: { 'import.meta.env.VITE_ENABLE_AI_RETRY': JSON.stringify('true') },
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
