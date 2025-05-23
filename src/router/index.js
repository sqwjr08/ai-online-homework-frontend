import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../components/mainpage.vue') },
  { path: '/login', component: () => import('../components/login&register.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router