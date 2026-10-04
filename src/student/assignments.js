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

export function answerInput(detail, answers) {
  const errors = {}, ids = detail.questions.map(q => q.question_id);
  if (!ids.length || new Set(ids).size !== ids.length) errors.form = '题目内容异常，请刷新题面或联系教师。';
  const rows = ids.map(question_id => {
    const answer_text = answers[question_id] ?? '';
    if (!answer_text.trim() || [...answer_text].length > 20000) errors[question_id] = '答案须为1–20000字符，不能只填写空白。';
    return { question_id, answer_text }; // Preserve whitespace; backend validates but does not trim answers.
  });
  return { body: { answers: rows }, errors };
}

export function createStudentAssignments(api) {
  const state = reactive({ items: [], loading: false, error: '', group: null, groupLoaded: false, groupLoading: false, groupError: '',
    selectedId: null, detail: null, detailLoading: false, detailError: '', submission: null, submissionState: 'idle', submissionError: '',
    answers: {}, answerErrors: {}, writing: false, checking: false, blocked: false, retryReady: false, submitted: false, confirmed: false, writeError: '', success: '' });
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
    if (state.writing || state.checking) return;
    cancel('detail'); cancel('submission');
    Object.assign(state, { selectedId: null, detail: null, detailLoading: false, detailError: '', submission: null, submissionState: 'idle', submissionError: '',
      answers: {}, answerErrors: {}, blocked: false, retryReady: false, submitted: false, confirmed: false, writeError: '', success: '' });
  }
  async function load() {
    if (disposed || state.writing || state.checking) return;
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
      state.submitted = true; state.confirmed = false;
      if (state.blocked) state.writeError = '已查到本人提交，不能重复提交或覆盖。';
    }, error => {
      state.submissionState = error.status === 404 ? 'none' : 'error';
      if (error.status !== 404) state.submissionError = error.message;
    });
  }
  async function open(id) {
    if (disposed || state.writing || state.checking) return;
    close(); state.selectedId = id;
    await Promise.allSettled([readDetail(), readSubmission()]);
  }
  function canSubmit() {
    return !disposed && !!state.detail && state.detail.id === state.selectedId && !state.detailLoading
      && state.groupLoaded && !state.groupLoading && state.group?.is_active && state.group.id === state.detail.class_id
      && state.submissionState === 'none' && !state.submitted && !state.writing && !state.checking && !state.blocked;
  }
  async function submit() {
    if (!canSubmit()) return false;
    const { body, errors } = answerInput(state.detail, state.answers);
    if (!state.confirmed) errors.confirm = '请确认提交后不能修改、撤回或覆盖。';
    state.answerErrors = errors; state.writeError = ''; state.success = '';
    if (Object.keys(errors).length) return false;
    const id = state.selectedId; state.writing = true;
    try {
      const result = await api.post(`/assignments/${id}/submissions`, body);
      if (disposed || state.selectedId !== id) return false;
      state.submission = submissionSummary(result, id); state.submissionState = 'found'; state.submitted = true;
      state.answers = {}; state.confirmed = false;
      state.success = '答案已保存。这不代表后台批改或教师确认已经完成，最终成绩须等待教师确认。';
      return true;
    } catch (error) {
      if (disposed || state.selectedId !== id) return false;
      state.confirmed = false;
      if (error.status === 422) {
        state.writeError = '答案未通过校验，输入已保留，请检查各题长度和空白内容。';
        for (const field of error.fieldErrors ?? []) {
          const index = field.path?.[2], row = body.answers[index];
          if (row && field.path?.[1] === 'answers') state.answerErrors[row.question_id] = '请检查此题答案，须为1–20000字符且不能全空白。';
        }
      } else {
        state.blocked = true; state.retryReady = false;
        state.writeError = ({ 400: '提交被拒绝：可能已截止或答案与题目不匹配。请核对最新题面和提交状态。',
          403: '没有提交权限，请核对所属班级。', 404: '作业当前不可提交，可能已归档或不存在。',
          409: '提交冲突：可能已有提交、班级已归档或题目内容异常。正在查询本人提交记录。' })[error.status]
          || '提交结果不确定，答案可能已保存。请先核对本人提交，不要直接重复发送。';
        if (error.status === 409) {
          await readSubmission();
          if (!disposed && !state.submitted) state.writeError = '提交冲突，尚未查到可确认的本人提交；也可能是班级归档或题目异常。请继续核对，不能直接重复发送。';
        }
      }
      return false;
    } finally { if (!disposed) state.writing = false; }
  }
  async function checkBeforeRetry() {
    if (disposed || !state.selectedId || state.writing || state.checking) return;
    state.checking = true; state.retryReady = false; state.confirmed = false;
    await Promise.allSettled([readDetail(), loadGroup(), readSubmission()]);
    if (disposed) return;
    state.checking = false;
    state.retryReady = !state.submitted && state.submissionState === 'none' && !!state.detail && state.group?.is_active && state.group.id === state.detail.class_id;
    state.writeError = state.submitted ? '已查到本人提交，不能重复提交或覆盖。'
      : state.retryReady ? '当前未查到提交，原输入保留；先前请求仍可能延迟完成。核对后才可手动再次提交，服务器会拒绝重复记录。' : '尚不能确认可提交，请核对题面、班级及本人提交查询的结果。';
  }
  function allowRetry() { if (state.retryReady && !state.writing && !state.checking && !state.submitted) { state.blocked = false; state.retryReady = false; state.confirmed = false; } }
  function dispose() { disposed = true; state.writing = false; state.checking = false; Object.keys(controllers).forEach(cancel); close(); state.items = []; state.group = null; }
  return { state, load, loadGroup, open, readDetail, readSubmission, close, dispose, canSubmit, submit, checkBeforeRetry, allowRetry };
}
