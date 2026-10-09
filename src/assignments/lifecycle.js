import { reactive } from 'vue';

export const statusName = value => ({ draft: '草稿', published: '已发布', archived: '已归档' }[value] ?? '未知状态');
export const sourceName = value => ({ snapshot: '发布时快照', draft_preview: '草稿引用预览（非发布快照）', legacy_reference: '历史题目引用（非发布快照）' }[value] ?? '未知内容来源');
export function canAct(record, action) {
  return action === 'publish' ? record?.status === 'draft' : action === 'archive' && ['draft', 'published'].includes(record?.status);
}

export function createAssignmentLifecycle(api) {
  const state = reactive({ id: null, action: 'view', record: null, loading: false, busy: false, error: '', success: '', confirmed: false, blocked: false });
  let disposed = false, version = 0, controller;
  async function prepare(id, action = 'view') {
    if (disposed || state.busy || !['view', 'publish', 'archive'].includes(action)) return false;
    const current = ++version;
    controller?.abort(); controller = new AbortController();
    Object.assign(state, { id, action, record: null, loading: true, confirmed: false, blocked: true, error: '', success: '' });
    try {
      const record = await api.get(`/assignments/${id}`, { signal: controller.signal });
      if (disposed || current !== version) return false;
      state.record = record; state.blocked = false;
      return true;
    } catch (error) {
      if (!disposed && current === version && error.kind !== 'cancelled') state.error = error.message;
      return false;
    } finally { if (!disposed && current === version) state.loading = false; }
  }
  async function submit() {
    if (disposed || state.loading || state.busy || state.blocked || !state.confirmed || !canAct(state.record, state.action)) return null;
    const current = version, action = state.action;
    state.busy = true; state.error = ''; state.success = '';
    try {
      // No request body, no client snapshot, deadline or status override.
      const record = await api.post(`/assignments/${state.id}/${action}`);
      if (disposed || current !== version) return null;
      state.record = record; state.action = 'view'; state.confirmed = false;
      state.success = action === 'publish' ? '服务器已确认作业发布。发布后的题目内容及截止时间不可修改。' : '服务器已确认作业归档。已有提交保留，目前没有恢复归档入口。';
      return record;
    } catch (error) {
      if (disposed || current !== version) return null;
      // Every failure requires fresh preview and explicit confirmation before another attempt.
      state.blocked = true; state.confirmed = false;
      const messages = {
        400: '操作未完成：截止时间可能已过，或所选题目已停用、缺失等。请读取最新内容核对；需要修改时返回草稿编辑。',
        403: '没有操作此作业的权限，请核对账号和班级归属。',
        404: '作业或班级不存在，请刷新列表核对。',
        409: '操作冲突：作业状态、班级状态、题目引用或内容可能已变化。请读取最新内容重新核对。',
        422: '请求未通过服务器校验，请重新读取详情核对。',
      };
      state.error = !error.status || error.status >= 500
        ? '操作结果不确定，服务器可能已经完成。请先读取最新状态核对，没有自动重试；旧请求仍可能延迟完成。'
        : messages[error.status] || error.message;
      return null;
    } finally { if (!disposed && current === version) state.busy = false; }
  }
  function close() {
    if (state.busy) return;
    version++; controller?.abort();
    Object.assign(state, { id: null, record: null, loading: false, error: '', success: '', confirmed: false, blocked: false });
  }
  function dispose() { disposed = true; state.busy = false; close(); }
  return { state, prepare, submit, close, dispose };
}
