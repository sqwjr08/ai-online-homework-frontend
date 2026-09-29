<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session } from '../auth/session.js';
import { loginDestination } from '../auth/guard.js';

const route = useRoute();
const router = useRouter();
const username = ref('');
const password = ref('');
const busy = ref(false);
const error = ref('');
async function submit() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    const user = await session.login(username.value.trim(), password.value);
    password.value = '';
    await router.replace(loginDestination(router, route.query.redirect, user.role));
  } catch (failure) {
    error.value = failure.status === 401 ? '用户名或密码不正确，请重新输入。'
      : failure.status === 403 ? '账号已停用，请联系管理员。'
      : failure.status === 422 ? '请检查用户名和密码的长度。'
      : failure.message || '暂时无法登录，请稍后重试。';
    password.value = '';
  } finally { busy.value = false; }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="brand-mark" aria-hidden="true">课</div>
      <p class="eyebrow">班级简答题作业平台</p>
      <h1 id="login-title">登录你的课堂</h1>
      <p class="muted">使用账号登录，继续你的教学或学习任务。</p>
      <p v-if="route.query.reason === 'expired'" role="status" class="notice">登录已失效，请重新登录。</p>
      <form @submit.prevent="submit" :aria-busy="busy">
        <label for="username">用户名</label>
        <input id="username" v-model="username" autocomplete="username" minlength="3" maxlength="50" required :disabled="busy" placeholder="请输入用户名" />
        <label for="password">密码</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" minlength="4" maxlength="128" required :disabled="busy" placeholder="请输入密码" aria-describedby="login-error" />
        <p id="login-error" v-if="error" role="alert" class="error">{{ error }}</p>
        <button class="primary full" :disabled="busy" type="submit">{{ busy ? '正在核实身份…' : '登录' }}</button>
      </form>
      <p class="login-help">忘记密码或没有账号？请联系教师或管理员。<br />学生自助注册暂未开放。</p>
    </section>
    <p class="login-foot">答案先保存，成绩由教师确认后公布。</p>
  </main>
</template>
