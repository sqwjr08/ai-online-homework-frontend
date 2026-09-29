import { createRouter, createWebHistory } from 'vue-router';
import { session } from '../auth/session.js';
import { authorizeRoute } from '../auth/guard.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'root', component: () => import('../views/StatusPage.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginPage.vue') },
    ...['teacher', 'student', 'admin'].map(role => ({
      path: `/${role}`, name: role, component: () => import('../views/RoleHome.vue'),
      meta: { requiresAuth: true, roles: [role] },
    })),
    { path: '/forbidden', name: 'forbidden', component: () => import('../views/StatusPage.vue'), meta: { requiresAuth: true } },
    { path: '/session-error', name: 'session-error', component: () => import('../views/StatusPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/StatusPage.vue') },
  ],
});
router.beforeEach(to => authorizeRoute(to, session));
session.onExpired(() => {
  if (router.currentRoute.value.meta.requiresAuth) router.replace({ name: 'login', query: { reason: 'expired' } });
});
export default router;
