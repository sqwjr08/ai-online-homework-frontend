<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, roleHomes } from '../auth/session.js';
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const title = computed(() => route.name === 'session-error' ? '暂时无法核实登录状态' : route.name === 'forbidden' ? '没有访问权限' : '页面不存在');
async function retry() {
  if (busy.value) return;
  busy.value = true;
  await session.restore();
  busy.value = false;
  if (session.state.status !== 'error') await router.replace('/');
}
function leave() { void session.logout(); router.replace('/login'); }
</script>
<template>
  <main class="status-page">
    <p class="eyebrow">班级简答题作业平台</p>
    <h1>{{ title }}</h1>
    <template v-if="route.name === 'session-error'">
      <p class="muted" role="alert">{{ session.state.error || '服务暂时不可用，请稍后重试。' }}</p>
      <div class="status-actions"><button class="primary" @click="retry" :disabled="busy">{{ busy ? '正在重试…' : '重试' }}</button><button @click="leave">退出并返回登录</button></div>
    </template>
    <template v-else>
      <p class="muted">{{ route.name === 'forbidden' ? '当前账号无法进入这个角色的工作区。' : '请检查地址，或返回你的工作入口。' }}</p>
      <RouterLink class="button-link" :to="session.state.user ? roleHomes[session.state.user.role] : '/login'">返回{{ session.state.user ? '我的工作区' : '登录' }}</RouterLink>
    </template>
  </main>
</template>
