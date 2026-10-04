import { reactive } from 'vue';

export const reviewStatus = value => ({ pending_teacher_review: '待教师确认', confirmed: '成绩已确认' }[value] ?? '未知人工状态');
export const aiStatus = value => ({ pending: '等待后台批改', processing: '后台批改中', succeeded: 'AI草稿已生成', failed: '后台批改失败', cancelled: '后台任务已取消', legacy_unknown: '历史AI状态未知' }[value] ?? '未知AI状态');
export const aiError = value => ({ timeout: '调用超时', provider_unavailable: '评分服务暂不可用', grading_failed: '评分未通过或处理失败', retry_exhausted: '本轮后台尝试次数已耗尽' }[value] ?? (value ? '其他评分错误，请联系维护者核对' : '无记录'));
export function teacherSubmission(data, assignmentId) {
  if (data?.view !== 'teacher' || data.assignment_id !== assignmentId || !Array.isArray(data.answers)) throw new Error('提交响应与当前教师作业不匹配，请重新读取。');
  return data;
}
export function comparisonRows(assignment, submission) {
  const answers = submission?.answers ?? [], questions = assignment?.questions ?? [];
  return {
    rows: questions.map(question => {
      const matches = answers.filter(a => a.question_id === question.question_id);
      const uniqueQuestion = questions.filter(q => q.question_id === question.question_id).length === 1;
      return { question, answer: uniqueQuestion && matches.length === 1 ? matches[0] : null, mismatch: !uniqueQuestion || matches.length !== 1 };
    }),
    unmatched: answers.filter(answer => questions.filter(q => q.question_id === answer.question_id).length !== 1 || answers.filter(a => a.question_id === answer.question_id).length !== 1),
  };
}
export function createReviewModel(api) {
  const state = reactive({ assignmentId: null, assignment: null, assignmentLoading: false, assignmentError: '',
    items: [], total: 0, page: 1, pageSize: 20, filter: '', progress: null, loading: false, error: '',
    selectedId: null, detail: null, detailLoading: false, detailError: '' });
  const versions = {}, controllers = {}; let disposed = false;
  function cancel(key) { versions[key] = (versions[key] ?? 0) + 1; controllers[key]?.abort(); }
  async function request(key, url, params, success, failure) {
    if (disposed) return;
    cancel(key); const version = versions[key]; controllers[key] = new AbortController();
    try { const data = await api.get(url, { params, signal: controllers[key].signal }); if (!disposed && version === versions[key]) success(data); }
    catch (error) { if (!disposed && version === versions[key]) failure(error); }
  }
  function close() { cancel('detail'); Object.assign(state, { selectedId: null, detail: null, detailError: '', detailLoading: false }); }
  async function loadAssignment() {
    if (disposed || !state.assignmentId) return;
    const id = state.assignmentId; state.assignment = null; state.assignmentError = ''; state.assignmentLoading = true;
    await request('assignment', `/assignments/${id}`, {}, data => {
      if (data.view !== 'teacher' || data.id !== id) throw new Error('作业响应不是对应的教师视图。');
      state.assignment = data; state.assignmentLoading = false;
    }, error => { state.assignmentLoading = false; state.assignmentError = error.message; });
  }
  async function load(page = 1, keepDetail = false) {
    if (disposed || !state.assignmentId) return;
    const id = state.assignmentId; if (!keepDetail) close(); state.page = page; state.items = []; state.total = 0; state.progress = null; state.loading = true; state.error = '';
    await request('list', `/assignments/${id}/submissions`, { page, page_size: state.pageSize, ...(state.filter ? { status: state.filter } : {}) }, data => {
      state.items = data.items.map(item => teacherSubmission(item, id)); state.total = data.total; state.page = data.page; state.pageSize = data.page_size;
      state.progress = data.progress; state.loading = false;
    }, error => { state.loading = false; state.error = error.message; });
  }
  async function read(id) {
    if (disposed || !state.assignmentId) return;
    const assignmentId = state.assignmentId; close(); state.selectedId = id; state.detailLoading = true;
    await request('detail', `/submissions/${id}`, {}, data => {
      if (data.id !== id) throw new Error('提交编号不匹配，请重新读取。');
      state.detail = teacherSubmission(data, assignmentId); state.detailLoading = false;
    }, error => { state.detailLoading = false; state.detailError = error.message; });
  }
  async function select(id) {
    if (disposed) return;
    Object.keys(controllers).forEach(cancel); close(); state.assignmentId = id; state.filter = ''; state.pageSize = 20;
    await Promise.allSettled([loadAssignment(), load(1)]);
  }
  function dispose() { disposed = true; Object.keys(controllers).forEach(cancel); close(); state.assignment = null; state.items = []; state.progress = null; }
  return { state, select, load, loadAssignment, read, close, dispose };
}
