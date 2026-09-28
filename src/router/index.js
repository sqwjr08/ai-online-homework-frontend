import { createRouter, createWebHistory } from 'vue-router'
import MainPage from '../components/mainpage.vue'
import LoginRegister from '../components/login&register.vue'

const routes = [
  {
    path: '/',
    component: MainPage
  },
  {
    path: '/login',
    component: LoginRegister
  },
  { 
    path: '/admin/upload', component: () => import('../components/upload.vue'),
    name: 'Upload' // 添加命名路由方便<router-link>使用
  },
  {
    path: '/student', component: () => import('../components/studentpage.vue')
  },
  {
    path: '/admin', component: () => import('../components/admin.vue')
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
