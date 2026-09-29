import { reactive } from 'vue';

export function createClassesModel(api) {
  const state = reactive({ groups: [], filter: '', loading: false, error: '', selected: null,
    members: [], memberFilter: '', page: 1, pageSize: 20, total: 0, membersLoading: false, membersError: '',
    busy: false, writeError: '', success: '', uncertain: false, archiveTarget: null });
  let disposed = false, listVersion = 0, memberVersion = 0;
  let listController, memberController;
  function clearMembers() {
    memberVersion++; memberController?.abort();
    state.members = []; state.total = 0; state.membersError = ''; state.membersLoading = false; state.page = 1;
  }
  function deselect() { state.selected = null; clearMembers(); }
  async function load() {
    if (disposed) return false;
    const version = ++listVersion;
    listController?.abort(); listController = new AbortController();
    deselect(); state.groups = []; state.loading = true; state.error = '';
    try {
      const groups = await api.get('/classes/my', { signal: listController.signal,
        params: state.filter === '' ? {} : { is_active: state.filter === 'true' } });
      if (disposed || version !== listVersion) return false;
      state.groups = groups;
      return true;
    } catch (error) {
      if (!disposed && version === listVersion && error.kind !== 'cancelled') state.error = error.message;
      return false;
    } finally { if (!disposed && version === listVersion) state.loading = false; }
  }
  async function loadMembers(page = 1) {
    if (disposed || !state.selected) return false;
    const groupId = state.selected.id, version = ++memberVersion;
    memberController?.abort(); memberController = new AbortController();
    state.page = page; state.members = []; state.total = 0; state.membersError = ''; state.membersLoading = true;
    try {
      const data = await api.get(`/classes/${groupId}/members`, { signal: memberController.signal,
        params: { page, page_size: state.pageSize, ...(state.memberFilter === '' ? {} : { is_active: state.memberFilter === 'true' }) } });
      if (disposed || version !== memberVersion) return false;
      state.members = data.items; state.page = data.page; state.pageSize = data.page_size; state.total = data.total;
      return true;
    } catch (error) {
      if (!disposed && version === memberVersion && error.kind !== 'cancelled') state.membersError = error.message;
      return false;
    } finally { if (!disposed && version === memberVersion) state.membersLoading = false; }
  }
  function select(group) {
    if (disposed || state.busy || state.archiveTarget) return;
    clearMembers(); state.selected = { ...group }; state.memberFilter = '';
    return loadMembers(1);
  }
  function requestArchive(group) {
    if (disposed || state.busy || state.uncertain || !group.is_active) return false;
    state.archiveTarget = { id: group.id, name: group.name };
    state.success = ''; state.writeError = '';
    return true;
  }
  function cancelArchive() { if (!state.busy) state.archiveTarget = null; }
  async function write(action, name = '') {
    if (disposed || state.busy || state.uncertain) return false;
    if (action === 'archive' && !state.archiveTarget) return false;
    if (action === 'create' && state.archiveTarget) return false;
    state.writeError = ''; state.success = '';
    const normalizedName = name.trim();
    if (action === 'create' && (!normalizedName || [...normalizedName].length > 100)) {
      state.writeError = '班级名称去除首尾空白后须为1–100个字符。'; return false;
    }
    state.busy = true;
    try {
      const group = action === 'create'
        ? await api.post('/classes', { name: normalizedName })
        : await api.post(`/classes/${state.archiveTarget.id}/archive`);
      if (disposed) return false;
      state.success = action === 'create' ? `已创建「${group.name}」，班级码：${group.code}。`
        : `「${group.name}」当前${group.is_active ? '仍为使用中，请刷新后核对' : '已归档'}。`;
      state.archiveTarget = null;
      if (action === 'create') state.filter = '';
      await load();
      return !disposed;
    } catch (error) {
      if (disposed) return false;
      state.writeError = ({ 400: '当前教师账号不能创建班级，请联系管理员核对账号状态。',
        403: '没有权限操作该班级，请刷新列表。', 404: '班级不存在或当前不可访问，请刷新列表。',
        409: '班级状态已变化，请刷新后重新选择。', 422: '请检查班级名称或请求内容。' })[error.status] || error.message;
      if (!error.status || error.status >= 500) {
        state.uncertain = true;
        state.writeError = '操作结果不确定，可能已经保存。请先刷新并核对列表，不要直接重复操作。同名班级允许存在，不能仅按名称认定创建成功。';
      }
      // Always require a fresh, explicit archive selection after failure.
      state.archiveTarget = null;
      return false;
    } finally { if (!disposed) state.busy = false; }
  }
  async function checkResult() {
    if (state.busy) return;
    state.filter = '';
    if (await load()) { state.uncertain = false; state.writeError = '列表已刷新，请核对班级码及状态后再决定下一步；先前请求仍可能延迟完成。'; }
  }
  function dispose() { disposed = true; listVersion++; listController?.abort(); deselect(); state.groups = []; state.archiveTarget = null; }
  return { state, load, loadMembers, select, requestArchive, cancelArchive,
    create: name => write('create', name), archive: () => write('archive'), checkResult, dispose };
}
