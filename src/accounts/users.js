import { reactive } from 'vue';

export const roleLabels = { admin: '管理员', teacher: '教师', student: '学生' };
export function validateAccount({ username, password, role }) {
  const errors = {};
  if ([...username].length < 3 || [...username].length > 50 || /[\s\p{C}]/u.test(username))
    errors.username = '用户名须为3–50个字符，不能含空白或控制字符。';
  if ([...password].length < 4 || [...password].length > 128 || !password.trim())
    errors.password = '密码须为4–128个字符，不能全部为空白。';
  if (!['teacher', 'student'].includes(role)) errors.role = '只能创建教师或学生账号。';
  return errors;
}

export function createUsersModel(api) {
  const state = reactive({ items: [], total: 0, page: 1, pageSize: 20, loading: false,
    error: '', creating: false, createError: '', fieldErrors: {}, success: '', uncertain: '',
    filters: { username: '', role: '', active: '' } });
  let version = 0;
  let disposed = false;
  let controller;

  async function load(page = 1) {
    if (disposed) return false;
    const request = ++version;
    controller?.abort();
    controller = new AbortController();
    state.loading = true;
    state.error = '';
    state.items = [];
    state.total = 0;
    state.page = page;
    const { username, role, active } = state.filters;
    try {
      const data = await api.get('/users', { signal: controller.signal, params: {
        page, page_size: state.pageSize,
        ...(username ? { username } : {}), ...(role ? { role } : {}),
        ...(active !== '' ? { is_active: active === 'true' } : {}),
      } });
      if (disposed || request !== version) return false;
      state.items = data.items;
      state.total = data.total;
      state.page = data.page;
      state.pageSize = data.page_size;
      return true;
    } catch (error) {
      if (!disposed && request === version && error.kind !== 'cancelled') state.error = error.message;
      return false;
    } finally { if (!disposed && request === version) state.loading = false; }
  }

  async function create(input) {
    if (disposed || state.creating || state.uncertain) return false;
    state.success = '';
    state.createError = '';
    state.fieldErrors = validateAccount(input);
    if (Object.keys(state.fieldErrors).length) return false;
    state.creating = true;
    try {
      const user = await api.post('/users', { username: input.username, password: input.password,
        role: input.role, is_active: input.is_active });
      if (disposed) return false;
      state.success = `已创建${roleLabels[user.role]}账号「${user.username}」（${user.is_active ? '启用' : '停用'}）。`;
      return true;
    } catch (error) {
      if (disposed) return false;
      if (error.status === 409) state.fieldErrors = { username: '用户名已存在，请查询现有账号或更换用户名。' };
      else if (error.status === 422) {
        for (const item of error.fieldErrors || []) {
          const key = item.path[1];
          if (['username', 'password', 'role', 'is_active'].includes(key))
            state.fieldErrors[key] = ({ username: '请检查用户名长度及空白、控制字符。', password: '请检查密码长度，不能全部为空白。', role: '请选择教师或学生。', is_active: '请选择有效的初始状态。' })[key];
        }
        state.createError = '请检查填写内容后重新提交。';
      } else if (!error.status || error.status >= 500) {
        state.uncertain = input.username;
        state.createError = '无法确认建号结果，账号可能已经创建。请先按用户名查询，不要直接重复提交。';
      } else state.createError = error.message;
      return false;
    } finally { if (!disposed) state.creating = false; }
  }

  async function checkUncertain() {
    if (!state.uncertain || state.loading) return;
    state.filters = { username: state.uncertain, role: '', active: '' };
    if (await load(1)) {
      const found = state.items.some(user => user.username === state.uncertain);
      state.createError = found ? '已查到同名账号，请核对列表；不能据此确认其密码，不要重复建号。'
        : '当前页未发现同名账号；如有多页结果，请继续翻页核对。再次创建前需重新填写密码，先前请求仍可能延迟完成。';
      state.uncertain = '';
    }
  }
  function dispose() { disposed = true; version++; controller?.abort(); state.items = []; }
  return { state, load, create, checkUncertain, dispose };
}
