import { reactive } from 'vue';

export const emptyDraft = () => ({ title: '', description: '', class_id: '', due: '', questions: [] });
export function localDeadline(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('截止时间无法读取。');
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
export function draftInput(form, editing = false) {
  const errors = {}, title = form.title.trim();
  if (!title || [...title].length > 200) errors.title = '标题去除首尾空白后须为1–200字符。';
  if (!form.class_id) errors.class_id = '请选择班级。';
  const ids = form.questions.map(q => q.question_id);
  if (!ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length) errors.questions = '至少选择一道题，且不能重复。';
  let due_at = null;
  if (form.due) {
    const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(form.due);
    const normalized = parts ? `${parts[1]}:${parts[2] ?? '00'}.${(parts[3] ?? '').padEnd(3, '0')}` : '';
    const date = new Date(normalized);
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/.test(normalized) || !Number.isFinite(date.getTime()) || localDeadline(date.toISOString()) !== normalized) errors.due = '请选择有效的本地截止时间（注意夏令时跳过的时段）。';
    else due_at = date.toISOString();
    // Retain the original instant when an unchanged date falls in a repeated DST hour.
    if (form.original_due && form.due === form.original_local) due_at = form.original_due;
  }
  const body = { title, description: form.description || null, questions: ids.map(question_id => ({ question_id })), due_at };
  if (!editing) Object.assign(body, { class_id: form.class_id, status: 'draft' });
  return { body, errors };
}

function formFrom(data) {
  const due = localDeadline(data.due_at);
  return { title: data.title, description: data.description ?? '', class_id: data.class_id,
    due, original_due: data.due_at, original_local: due, questions: data.questions.map(q => ({ ...q })) };
}

export function createDraftsModel(api) {
  const state = reactive({ items: [], groups: [], loading: false, listError: '', groupsLoading: false, groupsError: '',
    form: null, id: null, status: 'draft', reading: false, busy: false, error: '', errors: {}, success: '',
    blocked: false, latest: null, checked: false, lockAcknowledged: false });
  let disposed = false, editorVersion = 0;
  const versions = {}, controllers = {};
  async function loadResource(key, url, params) {
    const list = key === 'list', flag = list ? 'loading' : 'groupsLoading', errorKey = list ? 'listError' : 'groupsError';
    if (disposed) return false;
    const version = versions[key] = (versions[key] || 0) + 1;
    controllers[key]?.abort(); controllers[key] = new AbortController();
    state[flag] = true; state[errorKey] = ''; state[list ? 'items' : 'groups'] = [];
    try {
      const data = await api.get(url, { params, signal: controllers[key].signal });
      if (disposed || version !== versions[key]) return false;
      state[list ? 'items' : 'groups'] = data; return true;
    } catch (error) { if (!disposed && version === versions[key]) state[errorKey] = error.message; return false; }
    finally { if (!disposed && version === versions[key]) state[flag] = false; }
  }
  const load = () => loadResource('list', '/assignments/my', { status: 'draft' });
  const loadGroups = () => loadResource('groups', '/classes/my', { is_active: true });
  function close() {
    if (state.busy || state.reading) return;
    editorVersion++; controllers.detail?.abort();
    Object.assign(state, { form: null, id: null, error: '', errors: {}, blocked: false, latest: null, checked: false, lockAcknowledged: false });
  }
  function begin() {
    if (disposed || state.form || state.reading) return;
    close(); state.form = emptyDraft(); state.status = 'draft'; state.success = '';
  }
  async function open(id) {
    if (disposed || state.form || state.reading || state.busy) return;
    close(); const version = ++editorVersion;
    state.reading = true; state.error = ''; state.success = '';
    controllers.detail = new AbortController();
    try {
      const data = await api.get(`/assignments/${id}`, { signal: controllers.detail.signal });
      if (disposed || version !== editorVersion) return;
      state.id = data.id; state.status = data.status;
      state.form = formFrom(data);
    } catch (error) { if (!disposed && version === editorVersion) state.error = error.message; }
    finally { if (!disposed && version === editorVersion) state.reading = false; }
  }
  function add(question) {
    if (!state.form || state.busy || state.blocked || state.status !== 'draft' || state.form.questions.some(q => q.question_id === question.id)) return;
    state.form.questions.push({ ...question, question_id: question.id });
  }
  function move(index, offset) {
    if (!state.form || state.busy || state.blocked || state.status !== 'draft') return;
    const next = index + offset, rows = state.form.questions;
    if (next < 0 || next >= rows.length) return;
    [rows[index], rows[next]] = [rows[next], rows[index]];
  }
  function remove(index) {
    if (state.form && !state.busy && !state.blocked && state.status === 'draft') state.form.questions.splice(index, 1);
  }
  async function save() {
    if (disposed || !state.form || state.busy || state.reading || state.blocked || state.status !== 'draft') return false;
    const { body, errors } = draftInput(state.form, Boolean(state.id));
    if (!state.lockAcknowledged) errors.lock = '请确认保存会永久锁定题目内容。';
    state.errors = errors; state.error = ''; state.success = '';
    if (Object.keys(errors).length) return false;
    const version = editorVersion; state.busy = true;
    try {
      const result = state.id ? await api.patch(`/assignments/${state.id}`, body) : await api.post('/assignments', body);
      if (disposed || version !== editorVersion) return false;
      state.id = result.id; state.status = result.status;
      state.form = formFrom(result);
      state.success = `草稿已保存（ID：${result.id}），尚未发布，学生不可见。`;
      state.lockAcknowledged = false;
      await load(); return !disposed;
    } catch (error) {
      if (disposed || version !== editorVersion) return false;
      if (error.status === 409 || !error.status || error.status >= 500) {
        state.blocked = true; state.latest = null; state.checked = false;
        state.error = error.status === 409 ? '保存冲突：作业状态、班级、引用题目或内容可能已变化。输入已保留，请读取最新状态核对。' : '保存结果不确定，可能已成功。输入已保留，请先核对，不能自动重复保存。';
      } else if (error.status === 422) state.error = '填写内容未通过校验，请检查标题、题目与截止时间；输入已保留。';
      else state.error = error.message;
      return false;
    } finally { if (!disposed && version === editorVersion) state.busy = false; }
  }
  async function check() {
    if (disposed || !state.blocked || state.busy) return;
    const version = editorVersion; state.busy = true; state.latest = null; state.checked = false;
    try {
      if (state.id) {
        const latest = await api.get(`/assignments/${state.id}`);
        if (disposed || version !== editorVersion) return;
        state.latest = latest; state.checked = true;
      } else state.checked = await load();
      if (!disposed && version === editorVersion && state.checked) state.error = '已读取最新结果，原输入保留。请核对内容及状态；同标题不代表同一作业，旧请求仍可能延迟完成。';
    } catch (error) { if (!disposed && version === editorVersion) state.error = error.message; }
    finally { if (!disposed && version === editorVersion) state.busy = false; }
  }
  function acknowledge() {
    if (!state.busy && state.checked && (!state.id || state.latest?.status === 'draft')) { state.blocked = false; state.lockAcknowledged = false; state.error = '已允许手动再次保存；最新状态仍以服务器判断为准。'; }
  }
  function dispose() { disposed = true; editorVersion++; Object.values(controllers).forEach(c => c.abort()); state.busy = false; state.reading = false; close(); state.items = []; state.groups = []; }
  return { state, load, loadGroups, begin, open, close, add, move, remove, save, check, acknowledge, dispose };
}
