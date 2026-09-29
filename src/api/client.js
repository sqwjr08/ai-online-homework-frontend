import axios from 'axios';
import { ApiError, normalizeApiError } from './errors.js';
import { createTokenStore } from './token.js';

export function createApiClient({ tokenStore = createTokenStore(), onUnauthorized = () => {}, adapter } = {}) {
  const client = axios.create({
    baseURL: '/api/v1', timeout: 15000, withCredentials: false,
    ...(adapter ? { adapter } : {}),
  });
  client.interceptors.request.use(config => {
    // Legacy absolute URLs must not receive a JWT; use params for query strings.
    const url = config.url;
    if (typeof url !== 'string' || !/^\/[a-zA-Z0-9_-]/.test(url)
      || /[\\#\s]/.test(url) || url.includes('..') || url.includes('%')
      || /^\/api(?:\/|$)/.test(url) || config.baseURL !== '/api/v1') {
      throw new ApiError('请使用不含 /api/v1 前缀的接口路径，例如 /auth/me。', { kind: 'configuration' });
    }
    config.headers.delete('Authorization');
    delete config.auth;
    config.withCredentials = false;
    const token = config.skipAuth ? null : tokenStore.get();
    config.sessionVersion = tokenStore.version();
    config.usedSessionToken = Boolean(token);
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });
  client.interceptors.response.use(
    response => response.data,
    error => {
      const config = error.config;
      if (error.response?.status === 401 && config?.usedSessionToken
        && config.sessionVersion === tokenStore.version()) {
        tokenStore.clear();
        onUnauthorized();
      }
      return Promise.reject(normalizeApiError(error));
    },
  );
  // No retries: a timed-out write may already have succeeded on the server.
  return client;
}
