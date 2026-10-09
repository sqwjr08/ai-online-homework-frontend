const messages = {
  400: '请求不符合业务规则，请检查后重试。',
  401: '登录已失效，请重新登录。',
  403: '没有权限执行此操作。',
  404: '内容不存在或当前不可访问。',
  409: '数据状态已变化，请重新查看后再操作。',
  413: '图片大小或像素超过限制。',
  415: '仅支持 JPEG 和 PNG 图片。',
  422: '请检查填写内容。',
  503: '服务暂时不可用，请稍后再试。',
};

export class ApiError extends Error {
  constructor(message, { kind = 'http', status = null, detail = null, fieldErrors = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    // Omit Axios config/request/response: these may contain credentials or answers.
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;
  if (error?.code === 'ERR_CANCELED') {
    return new ApiError('请求已取消。', { kind: 'cancelled' });
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new ApiError('请求超时，操作结果尚不确定，请先查询确认。', { kind: 'timeout' });
  }
  const status = error?.response?.status;
  if (!status) return new ApiError('无法连接服务，请检查网络。', { kind: 'network' });
  const rawDetail = error.response.data?.detail;
  // Keep validation paths/messages, never Pydantic input or ctx.
  const fieldErrors = status === 422 && Array.isArray(rawDetail)
    ? rawDetail.filter(item => Array.isArray(item?.loc) && typeof item?.msg === 'string')
      .map(item => ({
        path: item.loc.filter(part => typeof part === 'string' || typeof part === 'number'),
        message: item.msg,
      }))
    : [];
  const detail = typeof rawDetail === 'string' && status < 500 ? rawDetail : null;
  return new ApiError(messages[status] || (status >= 500 ? '服务发生错误，请稍后再试。' : '请求失败。'), {
    kind: status === 422 ? 'validation' : status === 401 ? 'unauthorized' : 'http',
    status, detail, fieldErrors,
  });
}
