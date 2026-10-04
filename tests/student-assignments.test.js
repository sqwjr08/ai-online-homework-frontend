import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentAssignments, studentAssignment, submissionSummary, deadlineText } from '../src/student/assignments.js';
import { authorizeRoute } from '../src/auth/guard.js';
const assignment = { id: 'a', view: 'student', status: 'published', class_id: 'c', title: '题', description: '说明', due_at: null,
  questions: [{ question_id: 'q', position: 1, prompt: '题干', image_urls: ['/uploads/images/a.png'], max_score: 10, reference_answer: 'SECRET', rubric: 'SECRET' }] };
const submission = { view: 'student', id: 's', assignment_id: 'a', status: 'pending_teacher_review', submitted_at: '2030-01-01T00:00:00Z', answers: [{ ai_score: 'SECRET' }], final_total_score: 9 };

test('student projections reject teacher/draft responses and discard restricted or unnecessary fields', () => {
  assert.ok(!JSON.stringify(studentAssignment(assignment)).includes('SECRET'));
  for (const data of [{ ...assignment, view: 'teacher' }, { ...assignment, status: 'draft' }]) assert.throws(() => studentAssignment(data));
  const result = submissionSummary(submission, 'a'); assert.equal('answers' in result, false); assert.equal('final_total_score' in result, false);
  assert.throws(() => submissionSummary({ ...submission, view: 'teacher' }, 'a')); assert.throws(() => submissionSummary(submission, 'other'));
});
test('deadline equality is closed; offsets, no deadline and invalid dates are explicit', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');
  assert.match(deadlineText('2030-01-01T08:00:00+08:00', now), /^已截止/);
  assert.match(deadlineText('2030-01-01T00:00:01Z', now), /^尚未截止/);
  assert.match(deadlineText(null, now), /未设置/); assert.match(deadlineText('invalid', now), /无法识别/);
});
test('only student-facing GETs are used; empty membership and archived membership remain distinguishable', async () => {
  const calls = []; let groups = [];
  const model = createStudentAssignments({ get: async (url, config) => { calls.push({ url, config }); return url === '/classes/my' ? groups : [assignment]; } });
  await model.load(); await model.loadGroup(); assert.equal(model.state.groupLoaded, true); assert.equal(model.state.group, null);
  assert.deepEqual(calls[0].config.params, { status: 'published' }); assert.equal(calls[0].url, '/assignments/my');
  groups = [{ id: 'c', name: '班', is_active: false }]; await model.loadGroup(); assert.equal(model.state.group.is_active, false); assert.equal(model.state.items.length, 1);
});
test('submission 404 means none, while 403/network/5xx mean unknown, not unsubmitted', async () => {
  let error = { status: 404 };
  const model = createStudentAssignments({ get: async url => { if (url.endsWith('/submissions/my')) throw error; return assignment; } });
  await model.open('a'); assert.equal(model.state.submissionState, 'none'); assert.equal(model.state.detail.id, 'a');
  for (const status of [403, 401, 503, 0]) { error = { status, message: '失败' }; await model.readSubmission(); assert.equal(model.state.submissionState, 'error'); assert.equal(model.state.submission, null); }
});
test('historical own submission may load independently when assignment detail is unavailable', async () => {
  const model = createStudentAssignments({ get: async url => { if (url.endsWith('/submissions/my')) return submission; throw { status: 404 }; } });
  await model.open('a'); assert.equal(model.state.detail, null); assert.ok(model.state.detailError); assert.equal(model.state.submissionState, 'found');
  assert.deepEqual(model.state.submission, { id: 's', status: 'pending_teacher_review', submitted_at: submission.submitted_at });
});
test('switching assignments and leaving cancel reads and ignore all late content', async () => {
  const calls = []; const model = createStudentAssignments({ get: (url, config) => new Promise(resolve => calls.push({ url, config, resolve })) });
  const first = model.open('a'), second = model.open('b'); assert.equal(calls[0].config.signal.aborted, true); assert.equal(calls[1].config.signal.aborted, true);
  calls[2].resolve({ ...assignment, id: 'b' }); calls[3].resolve({ ...submission, assignment_id: 'b', status: 'confirmed' }); await second;
  calls[0].resolve(assignment); calls[1].resolve(submission); await first; assert.equal(model.state.detail.id, 'b'); assert.equal(model.state.submission.status, 'confirmed');
  const third = model.open('a'); model.dispose(); calls[4].resolve(assignment); calls[5].resolve(submission); await third; assert.equal(model.state.detail, null); assert.equal(model.state.submission, null);
});
test('malformed teacher response becomes error without retaining data; student route rejects anonymous and teacher', async () => {
  const model = createStudentAssignments({ get: async url => url === '/assignments/my' ? [{ ...assignment, view: 'teacher' }] : { ...assignment, view: 'teacher' } });
  await model.load(); assert.deepEqual(model.state.items, []); assert.ok(model.state.error); assert.equal(model.state.loading, false);
  const route = { name: 'student-assignments', fullPath: '/student/assignments', meta: { requiresAuth: true, roles: ['student'] } };
  const session = { restore: async () => {}, state: { status: 'authenticated', user: { role: 'teacher' } } };
  assert.deepEqual(await authorizeRoute(route, session), { name: 'forbidden' }); session.state.user = null;
  assert.equal((await authorizeRoute(route, session)).name, 'login'); session.state.user = { role: 'student' }; assert.equal(await authorizeRoute(route, session), true);
});
