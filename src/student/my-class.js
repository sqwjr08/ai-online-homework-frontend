import { reactive } from 'vue';
import { ApiError } from '../api/errors.js';

export function createStudentClassModel(api, refreshUser) {
  const state = reactive({ group: null, loaded: false, loading: false, error: '', joining: false,
    joinError: '', success: '', requiresCheck: false });
  let disposed = false, version = 0, controller;
  async function load() {
    if (disposed) return false;
    const request = ++version;
    controller?.abort(); controller = new AbortController();
    state.loading = true; state.loaded = false; state.group = null; state.error = '';
    try {
      const [user, groups] = await Promise.all([refreshUser(), api.get('/classes/my', { signal: controller.signal })]);
      if (disposed || request !== version) return false;
      if (user.role !== 'student' || !Array.isArray(groups) || groups.length > 1
        || (user.class_id ? groups.length !== 1 || groups[0].id !== user.class_id : groups.length !== 0))
        throw new ApiError('班级关系暂时无法核实，请刷新重试或联系教师。', { kind: 'configuration' });
      state.group = groups[0] || null; state.loaded = true; state.requiresCheck = false;
      return true;
    } catch (error) {
      if (!disposed && request === version && error.kind !== 'cancelled') state.error = error.message;
      return false;
    } finally { if (!disposed && request === version) state.loading = false; }
  }
  async function join(rawCode) {
    if (disposed || state.joining || state.loading || !state.loaded || state.group || state.requiresCheck) return false;
    const code = rawCode.trim().toUpperCase();
    state.joinError = ''; state.success = '';
    if (!/^[A-Z0-9]{6}$/.test(code)) { state.joinError = '请输入6位字母或数字班级码。'; return false; }
    state.joining = true;
    try {
      const group = await api.post('/classes/join', { code });
      if (disposed) return false;
      state.success = `已加入「${group.name}」。`;
      state.requiresCheck = true;
      await load();
      return !disposed;
    } catch (error) {
      if (disposed) return false;
      state.joinError = ({ 403: '只有学生账号可以加入班级。', 404: '班级码无效或班级已归档，请向教师核实。',
        409: '你已属于另一个班级，不能转班。正在重新核实当前班级。', 422: '请检查班级码，应为6位字母或数字。' })[error.status] || error.message;
      if (error.status === 409 || !error.status || error.status >= 500) {
        state.requiresCheck = true;
        if (error.status === 409) await load();
        else state.joinError = '入班结果不确定，可能已经成功。请先刷新当前班级，不要直接重复提交。';
      }
      return false;
    } finally { if (!disposed) state.joining = false; }
  }
  return { state, load, join, dispose() { disposed = true; version++; controller?.abort(); state.group = null; } };
}
