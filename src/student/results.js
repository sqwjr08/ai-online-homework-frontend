import { reactive } from 'vue';
import { studentAssignment } from './assignments.js';

export function studentResult(data, userId, target) {
  if (!userId || data?.view !== 'student' || data.student_id !== userId || !data.id || !data.assignment_id
    || !['confirmed', 'pending_teacher_review'].includes(data.status) || !Array.isArray(data.answers)
    || (target.submissionId && data.id !== target.submissionId) || (target.assignmentId && data.assignment_id !== target.assignmentId)) {
    throw new Error('提交响应与当前学生或查询编号不匹配，请重新查询。');
  }
  const confirmed = data.status === 'confirmed';
  const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  // Never retain AI/reference fields, even if the server accidentally adds them.
  return { id: data.id, assignment_id: data.assignment_id, status: data.status, submitted_at: data.submitted_at,
    final_total_score: confirmed ? score(data.final_total_score) : null,
    reviewed_at: confirmed ? data.reviewed_at : null,
    answers: data.answers.map(answer => {
      if (typeof answer.question_id !== 'string' || typeof answer.answer_text !== 'string') throw new Error('答案响应异常，请联系教师核对。');
      return { question_id: answer.question_id, answer_text: answer.answer_text,
        final_score: confirmed ? score(answer.final_score) : null,
        final_comment: confirmed && typeof answer.final_comment === 'string' ? answer.final_comment : null };
    }) };
}
export function resultRows(result, assignment) {
  return (result?.answers ?? []).map(answer => {
    const matches = (assignment?.questions ?? []).filter(q => q.question_id === answer.question_id);
    const unique = result.answers.filter(a => a.question_id === answer.question_id).length === 1;
    return { answer, question: unique && matches.length === 1 ? matches[0] : null };
  });
}
export function createStudentResults(api, getUserId) {
  const state = reactive({ target: null, result: null, loading: false, error: '', assignment: null, contentLoading: false, contentError: '' });
  let version = 0, controller, disposed = false;
  function clear() {
    version++; controller?.abort();
    Object.assign(state, { target: null, result: null, loading: false, error: '', assignment: null, contentLoading: false, contentError: '' });
  }
  async function load(target) {
    if (disposed) return;
    clear(); if (!target?.submissionId && !target?.assignmentId) return;
    state.target = { ...target }; state.loading = true;
    const ownVersion = version, userId = getUserId(); controller = new AbortController();
    const options = { signal: controller.signal };
    const current = () => {
      if (disposed || version !== ownVersion) return false;
      if (userId !== getUserId()) { clear(); return false; }
      return true;
    };
    try {
      const url = target.submissionId ? `/submissions/${encodeURIComponent(target.submissionId)}` : `/assignments/${encodeURIComponent(target.assignmentId)}/submissions/my`;
      const data = await api.get(url, options);
      if (!current()) return;
      state.result = studentResult(data, userId, target); state.loading = false; state.contentLoading = true;
      try {
        const content = await api.get(`/assignments/${encodeURIComponent(state.result.assignment_id)}`, options);
        if (!current()) return;
        if (content.id !== state.result.assignment_id) throw new Error('题面编号不匹配。');
        state.assignment = studentAssignment(content);
      } catch (error) {
        if (!current()) return;
        state.contentError = [403, 404].includes(error.status) ? '当前无法访问此作业题面，可能已归档或不在可见范围；本人答案和成绩仍可查看。'
          : '题面暂时无法读取，以下保留本人答案与成绩；请稍后刷新或联系教师。';
      } finally { if (current()) state.contentLoading = false; }
    } catch (error) {
      if (!current()) return;
      state.loading = false; state.error = ({ 403: '无权查看这份提交，只能查询本人记录。', 404: '未找到可访问的本人提交，请核对编号。', 422: '编号格式不正确，请核对已保存的链接或编号。' })[error.status] ?? error.message;
    }
  }
  function dispose() { disposed = true; clear(); }
  return { state, load, clear, dispose };
}
