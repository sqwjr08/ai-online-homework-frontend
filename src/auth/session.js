import { reactive, readonly } from 'vue';
import { createApiClient } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { createTokenStore } from '../api/token.js';

export const SESSION_KEY = 'class-homework.access-token';
export const roleHomes = { admin: '/admin', teacher: '/teacher', student: '/student' };

export function createSession({ storage = null, adapter } = {}) {
  const tokens = createTokenStore();
  const state = reactive({ user: null, status: 'anonymous', error: null, storageWarning: false });
  let generation = 0;
  let pendingRestore = null;
  const expiredListeners = new Set();
  function save(value) {
    try {
      if (!storage) throw new Error('Storage unavailable');
      if (value) storage.setItem(SESSION_KEY, value);
      else storage.removeItem(SESSION_KEY);
    } catch { state.storageWarning = true; }
  }
  function clear() {
    generation++;
    pendingRestore = null;
    tokens.clear();
    save(null);
    state.user = null;
    state.status = 'anonymous';
    state.error = null;
  }
  const api = createApiClient({ tokenStore: tokens, adapter, onUnauthorized() {
    clear();
    for (const listener of expiredListeners) listener();
  } });
  try {
    const saved = storage?.getItem(SESSION_KEY);
    if (saved) { tokens.set(saved); state.status = 'idle'; }
  } catch { save(null); }

  function validateUser(user) {
    if (!user || !Object.hasOwn(roleHomes, user.role) || user.is_active !== true
      || typeof user.id !== 'string' || typeof user.username !== 'string') {
      throw new ApiError('账号状态无法确认，请联系管理员。', { kind: 'configuration' });
    }
    // Never cache server extras or use a decoded JWT as the role authority.
    return { id: user.id, username: user.username, role: user.role, class_id: user.class_id ?? null };
  }
  async function login(username, password) {
    clear();
    const attempt = generation;
    state.status = 'loading';
    try {
      const result = await api.post('/auth/login', { username, password }, { skipAuth: true });
      if (attempt !== generation) throw new ApiError('登录已取消。', { kind: 'cancelled' });
      if (!result || result.token_type !== 'bearer') throw new ApiError('登录响应无效。', { kind: 'configuration' });
      tokens.set(result.access_token);
      const user = validateUser(await api.get('/auth/me'));
      if (attempt !== generation) throw new ApiError('登录已取消。', { kind: 'cancelled' });
      save(tokens.get());
      state.user = user;
      state.status = 'authenticated';
      return user;
    } catch (error) {
      if (attempt === generation) clear();
      throw error;
    }
  }
  function restore() {
    if (state.status === 'authenticated' || !tokens.get()) return Promise.resolve();
    if (pendingRestore) return pendingRestore;
    const attempt = generation;
    state.status = 'loading';
    state.error = null;
    const job = (async () => {
      try {
        const user = validateUser(await api.get('/auth/me'));
        if (attempt !== generation) return;
        state.user = user;
        state.status = 'authenticated';
      } catch (error) {
        if (attempt !== generation) return;
        if (error.kind === 'configuration' || error.status === 401) clear();
        else { state.user = null; state.status = 'error'; state.error = error.message; }
      } finally {
        if (attempt === generation) pendingRestore = null;
      }
    })();
    pendingRestore = job;
    return job;
  }
  function logout() {
    // Logout is advisory on the backend; always clear local state immediately.
    clear();
    return api.post('/auth/logout', undefined, { skipAuth: true, timeout: 3000 }).catch(() => {});
  }
  async function refreshUser() {
    const attempt = generation;
    const user = validateUser(await api.get('/auth/me'));
    if (attempt !== generation || state.status !== 'authenticated') throw new ApiError('会话已变化。', { kind: 'cancelled' });
    state.user = user;
    return user;
  }
  return { state: readonly(state), api, login, restore, logout, refreshUser,
    onExpired(listener) { expiredListeners.add(listener); return () => expiredListeners.delete(listener); },
  };
}

let storage = null;
try { storage = typeof window === 'undefined' ? null : window.sessionStorage; } catch { /* Memory-only fallback. */ }
export const session = createSession({ storage });
