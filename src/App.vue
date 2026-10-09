<script setup>
import { useRouter, useRoute } from 'vue-router';
import { session, roleHomes } from './auth/session.js';
const router = useRouter();
const route = useRoute();
const labels = { teacher: '教师', student: '学生', admin: '管理员' };
function logout() { void session.logout(); router.replace('/login'); }
</script>
<template>
  <header v-if="session.state.user" class="app-header">
    <RouterLink class="brand" :to="roleHomes[session.state.user.role]">课后 · 班级作业</RouterLink>
    <nav aria-label="账号导航"><span class="role-badge">{{ labels[session.state.user.role] }}</span><span class="account-name">{{ session.state.user.username }}</span><button @click="logout">退出登录</button></nav>
  </header>
  <RouterView v-if="!route.meta.requiresAuth || session.state.status === 'authenticated'" :key="session.state.user?.id || 'anonymous'" />
  <p v-else class="status-page" role="status">正在核实登录状态…</p>
</template>
