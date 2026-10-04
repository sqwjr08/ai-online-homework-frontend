import { reactive } from 'vue';
import { comparisonRows, teacherSubmission } from './review.js';

export function gradeable(assignment, submission) {
  if (!assignment || assignment.view !== 'teacher' || assignment.id !== submission?.assignment_id || submission.view !== 'teacher'
    || submission.status !== 'pending_teacher_review' || !['published', 'archived'].includes(assignment.status)
    || !['snapshot', 'legacy_reference'].includes(assignment.question_source)) return false;
  const { rows, unmatched } = comparisonRows(assignment, submission);
  return !!rows.length && !unmatched.length && rows.every(row => !row.mismatch && Number.isFinite(row.question.max_score) && row.question.max_score >= 0);
}
export function gradeInput(questions, fields) {
  const errors = {}, grades = []; let cents = 0;
  for (const question of questions) {
    const field = fields[question.question_id] ?? {}, raw = String(field.score ?? '').trim(), score = Number(raw);
    // Decimal text only; integer cents avoid 0.1 + 0.2 floating-point preview artifacts.
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(score) || score < 0 || score > question.max_score || !Number.isSafeInteger(Math.round(score * 100))) {
      errors[question.question_id] = `请输入0至${question.max_score}之间的分数，最多两位小数。`;
    }
    const comment = String(field.comment ?? '');
    if ([...comment].length > 1000) errors[question.question_id] = '评语最多1000字符。';
    cents += Math.round(score * 100);
    grades.push({ question_id: question.question_id, final_score: score, final_comment: comment.trim() || null });
  }
  if (!questions.length || !Number.isSafeInteger(cents)) errors.form = '无法计算总分，请核对题目和分数。';
  return { body: { grades }, errors, total: Object.keys(errors).length ? null : cents / 100 };
}
export function createGrading(api, onConfirmed = () => {}, onChecked = () => {}) {
  const state = reactive({ active: false, busy: false, checking: false, assignment: null, submission: null, fields: {}, accepted: false,
    errors: {}, error: '', success: '', blocked: false, retryReady: false, locked: false });
  let disposed = false;
  function begin(assignment, submission) {
    if (disposed || state.active || !gradeable(assignment, submission)) return false;
    Object.assign(state, { active: true, assignment, submission, fields: Object.fromEntries(assignment.questions.map(q => [q.question_id, { score: '', comment: '' }])),
      accepted: false, errors: {}, error: '', success: '', blocked: false, retryReady: false, locked: false });
    return true;
  }
  function cancel() {
    if (state.busy || state.checking) return false;
    Object.assign(state, { active: false, assignment: null, submission: null, fields: {}, accepted: false, errors: {}, error: '', success: '', blocked: false, retryReady: false, locked: false });
    return true;
  }
  function confirmed(data) {
    teacherSubmission(data, state.submission.assignment_id);
    if (data.id !== state.submission.id || data.status !== 'confirmed') throw new Error('确认响应异常，请查询最新成绩。');
    state.submission = data; state.locked = true; state.blocked = true; state.retryReady = false; state.accepted = false;
    state.error = '';
    state.success = '已读取教师确认成绩，成绩已锁定。以页面中的服务器结果为准。';
    onConfirmed(data);
  }
  async function check() {
    if (disposed || !state.active || state.checking || state.locked) return;
    state.checking = true; state.blocked = true; state.retryReady = false; state.accepted = false;
    const id = state.submission.id, assignmentId = state.submission.assignment_id;
    try {
      const result = teacherSubmission(await api.get(`/submissions/${id}`), assignmentId);
      if (disposed) return;
      if (result.id !== id) throw new Error('提交编号不匹配。');
      if (result.status === 'confirmed') { confirmed(result); return; }
      const assignment = await api.get(`/assignments/${assignmentId}`);
      if (disposed) return;
      if (assignment?.id !== assignmentId || assignment.view !== 'teacher' || !Array.isArray(assignment.questions)) throw new Error('题面响应异常。');
      state.submission = result; state.assignment = assignment;
      state.retryReady = gradeable(assignment, result);
      for (const question of assignment.questions) state.fields[question.question_id] ??= { score: '', comment: '' };
      onChecked({ assignment, submission: result });
      state.error = state.retryReady ? '最新记录尚未确认。请核对最新题面与原输入，再明确选择继续评分；不会自动再次发送。' : '当前题目或提交状态不允许评分，请联系维护者核对。';
    } catch { if (!disposed) state.error = '尚未查清最新成绩或题面，原输入保留，暂不能再次确认。请稍后重新查询。'; }
    finally { if (!disposed) state.checking = false; }
  }
  function allowRetry() { if (!disposed && state.retryReady && !state.busy && !state.checking && !state.locked) { state.blocked = false; state.retryReady = false; state.accepted = false; state.error = ''; } }
  async function submit() {
    if (disposed || !state.active || state.busy || state.checking || state.blocked || !gradeable(state.assignment, state.submission)) return false;
    const { body, errors } = gradeInput(state.assignment.questions, state.fields);
    if (!state.accepted) errors.confirm = '请先确认成绩发布给学生后不能更正。';
    state.errors = errors; state.error = ''; if (Object.keys(errors).length) return false;
    state.busy = true;
    try {
      const data = await api.post(`/submissions/${state.submission.id}/confirm-grade`, body);
      if (disposed) return false;
      confirmed(data); return true;
    } catch (error) {
      if (disposed) return false;
      state.accepted = false;
      if (error.status === 422) {
        state.error = '评分未通过校验，输入已保留，请检查分数和评语。';
        for (const field of error.fieldErrors ?? []) {
          const row = field.path?.[1] === 'grades' && body.grades[field.path[2]];
          if (row) state.errors[row.question_id] = '请检查此题分数（最多两位小数）和评语（最多1000字符）。';
        }
      } else {
        state.blocked = true;
        state.error = ({ 400: '评分被拒绝，可能超出满分或题目不匹配。请查询最新记录后核对。', 403: '没有确认权限，请查询最新记录或联系管理员。', 404: '提交或作业不可访问，请查询核对。',
          409: '确认冲突，可能已锁定或数据需要修复，正在读取最新结果。' })[error.status] ?? '确认结果不确定，成绩可能已保存。请先查询最新结果，不要直接重复发送。';
        if (error.status === 409) await check();
      }
      return false;
    } finally { if (!disposed) state.busy = false; }
  }
  function dispose() { disposed = true; state.busy = false; state.checking = false; cancel(); }
  return { state, begin, cancel, check, allowRetry, submit, dispose };
}
