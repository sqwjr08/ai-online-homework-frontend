import { roleHomes } from './session.js';

export async function authorizeRoute(to, session) {
  if (to.name === 'session-error') return true;
  await session.restore();
  if (session.state.status === 'error') return { name: 'session-error' };
  const user = session.state.user;
  if (to.meta.requiresAuth && !user) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.roles && !to.meta.roles.includes(user?.role)) return { name: 'forbidden' };
  if (to.name === 'root' || (to.name === 'login' && user)) return user ? roleHomes[user.role] : { name: 'login' };
  return true;
}

export function loginDestination(router, redirect, role) {
  if (typeof redirect === 'string' && /^\/(admin|teacher|student)(\/|\?|$)/.test(redirect)
    && !/[\\\s]/.test(redirect)) {
    const target = router.resolve(redirect);
    if (target.meta.roles?.includes(role)) return target.fullPath;
  }
  return roleHomes[role];
}
