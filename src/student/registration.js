import { reactive } from 'vue';
import { validateAccount } from '../accounts/users.js';

export function createRegistrationModel(api) {
  const state = reactive({ busy: false, errors: {}, error: '', success: '', uncertain: false });
  let disposed = false;
  async function register({ username, password, confirmation }) {
    if (disposed || state.busy || state.success || state.uncertain) return false;
    state.error = '';
    state.errors = validateAccount({ username, password, role: 'student' });
    if (password !== confirmation) state.errors.confirmation = '两次输入的密码不一致。';
    if (Object.keys(state.errors).length) return false;
    state.busy = true;
    try {
      await api.post('/auth/register', { username, password }, { skipAuth: true });
      if (disposed) return false;
      state.success = `学生账号「${username}」注册成功，请登录后加入班级。`;
      return true;
    } catch (error) {
      if (disposed) return false;
      if (error.status === 409) state.errors = { username: '用户名已存在。若是你的账号，请直接登录，否则更换用户名。' };
      else if (error.status === 422) {
        state.error = '请检查用户名和密码。';
        for (const item of error.fieldErrors || []) {
          if (item.path[1] === 'username') state.errors.username = '用户名须为3–50个字符，不含空白或控制字符。';
          if (item.path[1] === 'password') state.errors.password = '密码须为4–128个字符，不能全部为空白。';
        }
      } else if (!error.status || error.status >= 500) {
        state.uncertain = true;
        state.error = '注册结果不确定，账号可能已创建。请先尝试用刚才的账号密码登录，不要直接重复注册；仍无法确认时请联系教师或管理员。';
      } else state.error = error.message;
      return false;
    } finally { if (!disposed) state.busy = false; }
  }
  return { state, register, dispose() { disposed = true; } };
}
