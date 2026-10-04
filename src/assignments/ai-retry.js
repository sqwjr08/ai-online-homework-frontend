import { reactive } from 'vue';
import { teacherSubmission } from './review.js';

export function retryEligible(record) {
  return record?.view === 'teacher' && record.status === 'pending_teacher_review' && record.ai_status === 'failed'
    && Number.isInteger(record.ai_retry_count) && record.ai_retry_count >= 0 && record.ai_retry_count <= 2147483647;
}
export function createAiRetry(api, { enabled = false, onRead = () => {}, now = Date.now } = {}) {
  const state = reactive({ active: false, busy: false, checking: false, record: null, ready: false, accepted: false, expected: null, error: '', message: '' });
  let disposed = false, nextReadAt = 0;
  function cancel() {
    if (state.busy || state.checking) return false;
    Object.assign(state, { active: false, record: null, ready: false, accepted: false, expected: null, error: '', message: '' });
    return true;
  }
  function validate(data) {
    teacherSubmission(data, state.record.assignment_id);
    if (data.id !== state.record.id) throw new Error('提交编号不匹配。');
    return data;
  }
  async function readLatest() {
    state.checking = true; state.ready = false; state.accepted = false; state.expected = null;
    nextReadAt = now() + 5000;
    try {
      const data = await api.get(`/submissions/${state.record.id}`);
      if (disposed) return false;
      state.record = validate(data); onRead(data);
      return true;
    } catch { if (!disposed) state.error = '未能核实最新状态，不能发送重试。请稍后重新读取，也可返回人工评分。'; return false; }
    finally { if (!disposed) state.checking = false; }
  }
  async function prepare(record) {
    if (disposed || !enabled || state.busy || state.checking) return;
    if (state.active && now() < nextReadAt) { state.error = '请至少间隔5秒再查询。'; return; }
    state.active = true; state.record = record; state.error = ''; state.message = '';
    if (await readLatest()) {
      state.ready = retryEligible(state.record);
      state.expected = state.ready ? state.record.ai_retry_count : null;
      state.message = state.ready ? '已核对最新失败记录。请确认后申请一次后台重试。' : '最新状态不允许重试；仅未确认且后台批改失败的记录可申请。';
    }
  }
  async function refresh() {
    if (disposed || !state.active || state.busy || state.checking) return;
    if (now() < nextReadAt) { state.error = '请至少间隔5秒再查询。'; return; }
    state.error = ''; state.message = '';
    if (await readLatest()) state.message = '已读取最新状态。刷新不会执行批改或自动再次申请重试。';
  }
  async function submit() {
    if (disposed || !enabled || !state.active || state.busy || state.checking || !state.ready || !state.accepted || !retryEligible(state.record) || state.expected !== state.record.ai_retry_count) return false;
    const expected = state.expected; state.ready = false; state.accepted = false; state.busy = true; state.error = ''; state.message = '';
    try {
      const data = await api.post(`/submissions/${state.record.id}/retry-grading`, { expected_retry_count: expected });
      if (disposed) return false;
      validate(data);
      if (data.status !== 'pending_teacher_review' || data.ai_status !== 'pending' || data.ai_retry_count !== expected + 1) throw new Error('重试响应异常');
      state.record = data; onRead(data);
      state.message = '后台已接受本次重试，尚未完成批改。需要等待后台服务处理；不会自动再次申请。';
      return true;
    } catch (error) {
      if (disposed) return false;
      state.error = ({ 409: '状态或重试次数已变化，正在查询最新记录；不会自动使用新次数重发。', 403: '没有后台重试权限。', 404: '提交或所属作业当前不可访问。', 422: '重试请求未通过校验，请重新核对状态与次数。' })[error.status]
        ?? '重试结果不确定，可能已被接受。请查询最新状态，不能直接重复发送。';
      if (error.status === 409) await readLatest();
      return false;
    } finally { if (!disposed) state.busy = false; }
  }
  function dispose() { disposed = true; state.busy = false; state.checking = false; cancel(); }
  return { state, prepare, refresh, submit, cancel, dispose };
}
