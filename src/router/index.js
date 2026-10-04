import { createRouter, createWebHistory } from 'vue-router';
import { session } from '../auth/session.js';
import { authorizeRoute } from '../auth/guard.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'root', component: () => import('../views/StatusPage.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginPage.vue') },
    { path: '/register', name: 'register', component: () => import('../views/RegisterPage.vue') },
    { path: '/student/class', name: 'student-class', component: () => import('../views/MyClassPage.vue'), meta: { requiresAuth: true, roles: ['student'] } },
    { path: '/student/assignments', name: 'student-assignments', component: () => import('../views/StudentAssignmentsPage.vue'), meta: { requiresAuth: true, roles: ['student'] } },
    { path: '/admin/users', name: 'users', component: () => import('../views/UsersPage.vue'), meta: { requiresAuth: true, roles: ['admin'] } },
    { path: '/teacher/classes', name: 'teacher-classes', component: () => import('../views/ClassesPage.vue'), meta: { requiresAuth: true, roles: ['teacher'] } },
    { path: '/teacher/questions', name: 'teacher-questions', component: () => import('../views/QuestionsPage.vue'), meta: { requiresAuth: true, roles: ['teacher'] } },
    { path: '/teacher/assignments', name: 'teacher-assignments', component: () => import('../views/AssignmentDraftsPage.vue'), meta: { requiresAuth: true, roles: ['teacher'] } },
    { path: '/teacher/assignments/:assignmentId/submissions', name: 'teacher-submissions', component: () => import('../views/TeacherSubmissionsPage.vue'), meta: { requiresAuth: true, roles: ['teacher'] } },
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
