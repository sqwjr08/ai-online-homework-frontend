import { reactive } from 'vue';
import { questionInput } from './questions.js';

export function createQuestionMaintenance(api) {
  const state = reactive({ target: null, mode: '', form: {}, busy: false, blocked: false,
    latest: null, error: '', errors: {}, confirmed: false });
  let disposed = false, generation = 0;
  function begin(question, mode) {
    if (disposed || state.target || !question.is_active) return;
    generation++;
    Object.assign(state, { target: question.id, mode, latest: null, error: '', errors: {}, blocked: false, confirmed: false,
      form: { prompt: question.prompt, reference_answer: question.reference_answer,
        max_score: String(question.max_score), rubric: question.rubric ?? '' } });
  }
  function close() {
    if (state.busy) return;
    generation++;
    Object.assign(state, { target: null, mode: '', form: {}, latest: null, error: '', errors: {}, blocked: false, confirmed: false });
  }
  async function refresh() {
    if (disposed || !state.target || state.busy) return;
    const version = generation;
    state.busy = true; state.latest = null;
    try {
      const question = await api.get(`/questions/${state.target}`);
      if (disposed || version !== generation) return;
      state.latest = question;
      state.error = '已读取最新内容，原输入仍保留。请核对后再决定是否继续；此前未收到响应的请求仍可能延迟完成。';
    } catch (error) {
      if (!disposed && version === generation) state.error = error.message;
    } finally { if (!disposed && version === generation) state.busy = false; }
  }
  function acknowledge() {
    if (state.busy || !state.latest?.is_active) return;
    state.blocked = false; state.confirmed = false;
    state.error = '再次操作仍以服务器判断为准；已引用或锁定的题目请另建新题。';
  }
  async function submit() {
    if (disposed || !state.target || state.busy || state.blocked || (state.mode === 'disable' && !state.confirmed)) return null;
    const { body, errors } = questionInput(state.form);
    delete body.image_urls; // Text maintenance must never clear existing images.
    state.errors = state.mode === 'edit' ? errors : {};
    if (Object.keys(state.errors).length) return null;
    const version = generation;
    state.busy = true; state.error = ''; state.latest = null;
    try {
      const result = state.mode === 'edit'
        ? await api.patch(`/questions/${state.target}`, body)
        : await api.post(`/questions/${state.target}/disable`);
      return disposed || version !== generation ? null : result;
    } catch (error) {
      if (disposed || version !== generation) return null;
      if (error.status === 409) {
        state.blocked = true;
        state.error = '操作未完成：题目可能已停用、被作业引用或内容已锁定，也可能发生并发变化。输入已保留，请读取最新内容核对；锁定题目需另建新题。';
      } else if (!error.status || error.status >= 500) {
        state.blocked = true;
        state.error = '操作结果不确定，可能已经保存。输入已保留，请先读取最新内容核对，不要直接重复操作。';
      } else if (error.status === 422) {
        state.error = '填写内容未通过校验，输入已保留。';
        for (const field of error.fieldErrors || []) {
          const key = field.path?.[1];
          if (['prompt', 'reference_answer', 'max_score', 'rubric'].includes(key)) state.errors[key] = '请检查此项的长度、空白或数值范围。';
        }
      } else state.error = error.message;
      return null;
    } finally { if (!disposed && version === generation) state.busy = false; }
  }
  function dispose() { disposed = true; generation++; state.busy = false; close(); }
  return { state, begin, close, refresh, acknowledge, submit, dispose };
}
