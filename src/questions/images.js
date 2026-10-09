import { reactive } from 'vue';

export function imageSource(value) {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) return null;
  if (/^\/uploads\/images\/[^?#]+$/.test(value) && !value.includes('..')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function fileError(file) {
  if (!['image/jpeg', 'image/png'].includes(file?.type)) return '仅支持 JPEG 或 PNG 图片。';
  if (!file.size || file.size > 5 * 1024 * 1024) return '图片不能为空，且不能超过 5 MiB。';
  return '';
}

export function inspectImage(file, signal) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    const finish = (error) => {
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', abort);
      URL.revokeObjectURL(url);
      if (error) { image.src = ''; reject(error); } else resolve();
    };
    const abort = () => finish(new Error('已取消上传。'));
    image.onload = () => finish(image.naturalWidth > 10000 || image.naturalHeight > 10000
      || image.naturalWidth * image.naturalHeight > 20000000 ? new Error('图片单边不能超过 10,000 像素，总像素不能超过 2,000 万。') : null);
    image.onerror = () => finish(new Error('无法读取图片，请选择有效的 JPEG 或 PNG 文件。'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else image.src = url;
  });
}

export function createImageUpload(api, inspect = inspectImage) {
  const state = reactive({ busy: false, error: '', notice: '' });
  let disposed = false, controller;
  async function upload(file) {
    if (disposed || state.busy || !file) return null;
    state.error = fileError(file); state.notice = '';
    if (state.error) return null;
    state.busy = true; controller = new AbortController();
    let sent = false;
    try {
      await inspect(file, controller.signal);
      if (disposed) return null;
      const body = new FormData(); body.append('file', file);
      sent = true;
      const data = await api.post('/uploads/images', body, { signal: controller.signal });
      if (disposed) return null;
      if (!imageSource(data?.url)) throw new Error('上传响应中的图片地址不可用，请联系管理员检查图片服务配置。');
      state.notice = '图片已上传；保存题目后才会关联。';
      return data.url;
    } catch (error) {
      if (disposed) return null;
      const messages = { 400: '图片损坏、含动画或内容与文件类型不符。', 413: '图片输入、重编码结果或像素尺寸超过后端限制。', 415: '服务器仅接受 JPEG 和 PNG。', 422: '上传内容不符合接口要求。' };
      state.error = sent && (!error.status || error.status >= 500)
        ? '上传结果不确定，文件可能已保存，但尚未关联题目。没有自动重试；重新选择上传可能留下重复文件。'
        : messages[error.status] || error.message;
      return null;
    } finally { if (!disposed) state.busy = false; }
  }
  function dispose() { disposed = true; controller?.abort(); state.busy = false; state.error = ''; state.notice = ''; }
  return { state, upload, dispose };
}
