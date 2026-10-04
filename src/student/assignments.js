import { reactive } from 'vue';

export function studentAssignment(data) {
  if (data?.view !== 'student' || data.status !== 'published' || !Array.isArray(data.questions)) throw new Error('作业响应不符合学生视图，请刷新或联系教师。');
  // Explicit projection: never retain teacher answers/rubrics, even if a response contains extra fields.
  return { id: data.id, class_id: data.class_id, title: data.title, description: data.description,
    due_at: data.due_at, questions: data.questions.map(q => ({ question_id: q.question_id, position: q.position,
      prompt: q.prompt, image_urls: [...(q.image_urls ?? [])], max_score: q.max_score })) };
}
export function submissionSummary(data, assignmentId) {
  if (data?.view !== 'student' || data.assignment_id !== assignmentId || !['pending_teacher_review', 'confirmed'].includes(data.status)) throw new Error('提交响应不符合学生视图，请重新查询。');
  // This node only needs submission existence/status; no answers, AI drafts or grades are retained.
  return { id: data.id, status: data.status, submitted_at: data.submitted_at };
}
export function deadlineText(value, now = Date.now()) {
  if (!value) return '未设置截止时间';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '截止时间无法识别，请向教师核实';
  return timestamp <= now ? '已截止（按本机时间）' : '尚未截止（按本机时间）';
}

export function createStudentAssignments(api) {
  const state = reactive({ items: [], loading: false, error: '', group: null, groupLoaded: false, groupLoading: false, groupError: '',
    selectedId: null, detail: null, detailLoading: false, detailError: '', submission: null, submissionState: 'idle', submissionError: '' });
  let disposed = false;
  const versions = {}, controllers = {};
  function cancel(key) { versions[key] = (versions[key] || 0) + 1; controllers[key]?.abort(); }
  async function request(key, url, params, success, failure) {
    if (disposed) return;
    cancel(key); const version = versions[key]; controllers[key] = new AbortController();
    try {
      const data = await api.get(url, { params, signal: controllers[key].signal });
      if (!disposed && version === versions[key]) success(data);
    } catch (error) { if (!disposed && version === versions[key]) failure(error); }
  }
  function close() {
    cancel('detail'); cancel('submission');
    Object.assign(state, { selectedId: null, detail: null, detailLoading: false, detailError: '', submission: null, submissionState: 'idle', submissionError: '' });
  }
  async function load() {
    if (disposed) return;
    close(); state.items = []; state.loading = true; state.error = '';
    await request('list', '/assignments/my', { status: 'published' }, data => {
      state.items = data.map(studentAssignment); state.loading = false;
    }, error => { state.loading = false; state.error = error.message; });
  }
  async function loadGroup() {
    if (disposed) return;
    state.group = null; state.groupLoaded = false; state.groupLoading = true; state.groupError = '';
    await request('group', '/classes/my', {}, data => {
      const group = data[0]; state.group = group ? { id: group.id, name: group.name, is_active: group.is_active } : null;
      state.groupLoaded = true; state.groupLoading = false;
    }, error => { state.groupLoading = false; state.groupError = error.message; });
  }
  async function readDetail() {
    if (disposed || !state.selectedId) return;
    const id = state.selectedId; state.detail = null; state.detailLoading = true; state.detailError = '';
    await request('detail', `/assignments/${id}`, {}, data => {
      if (data.id !== id) throw new Error('作业响应不匹配，请重新读取。');
      state.detail = studentAssignment(data); state.detailLoading = false;
    }, error => { state.detailLoading = false; state.detailError = ({ 403: '无权查看此作业，请核对所属班级。', 404: '此作业当前不可查看，可能尚未发布或已归档。' })[error.status] || error.message; });
  }
  async function readSubmission() {
    if (disposed || !state.selectedId) return;
    const id = state.selectedId; state.submission = null; state.submissionState = 'loading'; state.submissionError = '';
    await request('submission', `/assignments/${id}/submissions/my`, {}, data => {
      state.submission = submissionSummary(data, id); state.submissionState = 'found';
    }, error => {
      state.submissionState = error.status === 404 ? 'none' : 'error';
      if (error.status !== 404) state.submissionError = error.message;
    });
  }
  async function open(id) {
    if (disposed) return;
    close(); state.selectedId = id;
    await Promise.allSettled([readDetail(), readSubmission()]);
  }
  function dispose() { disposed = true; Object.keys(controllers).forEach(cancel); close(); state.items = []; state.group = null; }
  return { state, load, loadGroup, open, readDetail, readSubmission, close, dispose };
}
