import { reactive } from 'vue';

export function questionInput(form) {
  const errors = {}, body = { prompt: form.prompt.trim(), reference_answer: form.reference_answer.trim(),
    max_score: Number(form.max_score), rubric: form.rubric.trim() || null, image_urls: [] };
  if (!body.prompt || [...body.prompt].length > 10000) errors.prompt = '题干须为1–10000个字符。';
  if (!body.reference_answer || [...body.reference_answer].length > 20000) errors.reference_answer = '参考答案须为1–20000个字符。';
  if (!String(form.max_score).trim() || !Number.isFinite(body.max_score) || body.max_score <= 0) errors.max_score = '满分必须是大于零的有限数字。';
  // An omitted rubric is null; explicitly entered whitespace is invalid.
  if (form.rubric !== '' && (!body.rubric || [...body.rubric].length > 5000)) errors.rubric = '评分标准填写后须为1–5000个非空白字符；不填写请清空。';
  return { body, errors };
}

export function createQuestionsModel(api) {
  const state = reactive({ items: [], total: 0, page: 1, pageSize: 20, q: '', active: true, loading: false, error: '',
    detail: null, detailId: null, detailLoading: false, detailError: '', creating: false, errors: {}, createError: '', success: '', uncertain: false });
  let disposed = false, listVersion = 0, detailVersion = 0, listController, detailController;
  function closeDetail() { detailVersion++; detailController?.abort(); state.detail = null; state.detailId = null; state.detailError = ''; state.detailLoading = false; }
  async function load(page = 1) {
    if (disposed) return false;
    const version = ++listVersion;
    listController?.abort(); listController = new AbortController(); closeDetail();
    state.loading = true; state.error = ''; state.items = []; state.total = 0; state.page = page;
    try {
      const data = await api.get('/questions', { signal: listController.signal, params: { page, page_size: state.pageSize, is_active: state.active,
        ...(state.q.trim() ? { q: state.q.trim() } : {}) } });
      if (disposed || version !== listVersion) return false;
      state.items = data.items; state.total = data.total; state.page = data.page; state.pageSize = data.page_size;
      return true;
    } catch (error) {
      if (!disposed && version === listVersion && error.kind !== 'cancelled') state.error = error.message;
      return false;
    } finally { if (!disposed && version === listVersion) state.loading = false; }
  }
  async function read(id) {
    if (disposed) return;
    const version = ++detailVersion;
    detailController?.abort(); detailController = new AbortController();
    state.detailId = id; state.detail = null; state.detailError = ''; state.detailLoading = true;
    try {
      const data = await api.get(`/questions/${id}`, { signal: detailController.signal });
      if (!disposed && version === detailVersion) state.detail = data;
    } catch (error) {
      if (!disposed && version === detailVersion && error.kind !== 'cancelled') state.detailError = error.message;
    } finally { if (!disposed && version === detailVersion) state.detailLoading = false; }
  }
  async function create(form) {
    if (disposed || state.creating || state.uncertain) return false;
    state.success = ''; state.createError = '';
    const { body, errors } = questionInput(form); state.errors = errors;
    if (Object.keys(errors).length) return false;
    state.creating = true;
    try {
      const question = await api.post('/questions', body);
      if (disposed) return false;
      state.success = `题目已创建（ID：${question.id}）。`;
      state.q = ''; state.active = true;
      await load(1);
      if (disposed) return false;
      // POST returns the same QuestionRead contract as the detail endpoint.
      closeDetail(); state.detailId = question.id; state.detail = question;
      return true;
    } catch (error) {
      if (disposed) return false;
      if (error.status === 422) {
        const messages = { prompt: '请检查题干，须为1–10000个字符。', reference_answer: '请检查参考答案，须为1–20000个字符。',
          max_score: '满分必须是大于零的有限数字。', rubric: '评分标准填写后须为1–5000个非空白字符。' };
        for (const field of error.fieldErrors || []) if (messages[field.path[1]]) state.errors[field.path[1]] = messages[field.path[1]];
        state.createError = '请检查填写内容，输入已保留。';
      } else if (!error.status || error.status >= 500) {
        state.uncertain = true;
        state.createError = '创建结果不确定，题目可能已经保存。请先检索核对，不要直接重复提交；相同题干允许存在。';
      } else state.createError = error.message;
      return false;
    } finally { if (!disposed) state.creating = false; }
  }
  async function checkResult(prompt) {
    if (state.creating || state.loading) return;
    state.q = [...prompt.trim()].slice(0, 200).join(''); state.active = true;
    if (await load(1)) {
      state.uncertain = false;
      state.createError = '已按题干前200字符检索启用题目，请查看详情并核对各页结果；同题干不能证明是本次创建，先前请求也可能延迟完成。';
    }
  }
  function dispose() { disposed = true; listVersion++; listController?.abort(); closeDetail(); state.items = []; }
  return { state, load, read, closeDetail, create, checkResult, dispose };
}
