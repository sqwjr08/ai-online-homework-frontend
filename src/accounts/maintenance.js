import { reactive } from 'vue';
import { passwordError } from './users.js';

export const canManageAccount = user => ['teacher', 'student'].includes(user?.role);

export function createMaintenanceModel(api) {
  const state = reactive({ target: null, action: '', busy: false, error: '', success: '', blocked: false });
  let disposed = false;
  function open(user, action) {
    if (disposed || state.busy || !canManageAccount(user) || !['status', 'password'].includes(action)) return false;
    state.target = { id: user.id, username: user.username, is_active: user.is_active };
    state.action = action;
    state.error = ''; state.success = ''; state.blocked = false;
    return true;
  }
  function close() {
    if (state.busy) return false;
    state.target = null; state.action = ''; state.error = ''; state.blocked = false;
    return true;
  }
  async function confirm(password = '', confirmation = '') {
    if (disposed || state.busy || !state.target || state.blocked) return false;
    state.error = '';
    if (state.action === 'password') {
      state.error = passwordError(password) || (password !== confirmation ? '两次输入的新密码不一致。' : '');
      if (state.error) return false;
    }
    const target = { ...state.target }, action = state.action;
    state.busy = true;
    try {
      const user = action === 'status'
        ? await api.patch(`/users/${target.id}/status`, { is_active: !target.is_active })
        : await api.post(`/users/${target.id}/reset-password`, { password });
      if (disposed) return false;
      state.success = action === 'status'
        ? `账号「${user.username}」当前为${user.is_active ? '启用' : '停用'}。状态实际变化后，原登录令牌失效，重新启用也不会恢复旧令牌。`
        : `已重置「${user.username}」的密码，原登录令牌已失效。${user.is_active ? '请使用新密码重新登录。' : '账号仍为停用状态，重置密码不会启用账号。'}`;
      state.target = null; state.action = '';
      return true;
    } catch (error) {
      if (disposed) return false;
      if (!error.status || error.status >= 500) {
        state.error = action === 'password'
          ? '密码重置结果不确定，可能已经生效。列表无法验证密码；请核实后再决定是否重新发起重置，不要直接重复提交。'
          : '状态修改结果不确定，可能已经生效。请关闭并刷新列表，核对当前状态后再决定操作。';
        state.blocked = true;
      } else {
        state.error = ({ 403: '无权维护此账号，管理员账号受保护。', 404: '账号不存在或当前不可访问，请刷新列表。',
          409: '账号已发生变化，请刷新后重新选择，不会自动重试。',
          422: action === 'password' ? '请检查新密码：4–128个字符，不能全部为空白。' : '状态值无效，请刷新后重新选择。' })[error.status] || error.message;
        state.blocked = [403, 404, 409].includes(error.status);
      }
      return false;
    } finally { if (!disposed) state.busy = false; }
  }
  function dispose() { disposed = true; state.target = null; }
  return { state, open, close, confirm, dispose };
}
