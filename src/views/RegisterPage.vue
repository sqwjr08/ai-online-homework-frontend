<script setup>
import { onBeforeUnmount, reactive } from 'vue';
import api from '../api/index.js';
import { createRegistrationModel } from '../student/registration.js';
const model = createRegistrationModel(api), state = model.state;
const form = reactive({ username: '', password: '', confirmation: '' });
function clearPasswords() { form.password = ''; form.confirmation = ''; }
async function submit() {
  const pending = model.register({ ...form });
  if (state.busy) clearPasswords();
  await pending;
}
onBeforeUnmount(() => { clearPasswords(); model.dispose(); });
</script>
<template>
  <main class="login-page"><section class="login-card" aria-labelledby="register-title">
    <p class="eyebrow">班级简答题作业平台</p><h1 id="register-title">注册学生账号</h1>
    <p class="muted">注册后登录，再使用教师提供的班级码入班。教师账号请联系管理员。</p>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
    <form v-if="!state.success && !state.uncertain" @submit.prevent="submit" :aria-busy="state.busy">
      <fieldset :disabled="state.busy">
        <label for="register-name">用户名</label><input id="register-name" v-model="form.username" autocomplete="username" required aria-describedby="register-name-help" :aria-invalid="!!state.errors.username" />
        <p id="register-name-help" class="field-help">3–50个字符，不含空白或控制字符。</p><p v-if="state.errors.username" class="error" role="alert">{{ state.errors.username }}</p>
        <label for="register-password">密码</label><input id="register-password" v-model="form.password" type="password" autocomplete="new-password" required aria-describedby="register-password-help" :aria-invalid="!!state.errors.password" />
        <p id="register-password-help" class="field-help">4–128个字符，不能全部为空白；首尾空格保留。</p><p v-if="state.errors.password" class="error" role="alert">{{ state.errors.password }}</p>
        <label for="register-confirm">再次输入密码</label><input id="register-confirm" v-model="form.confirmation" type="password" autocomplete="new-password" required :aria-invalid="!!state.errors.confirmation" /><p v-if="state.errors.confirmation" class="error" role="alert">{{ state.errors.confirmation }}</p>
        <button type="submit" class="primary full">{{ state.busy ? '正在注册…' : '注册学生账号' }}</button>
      </fieldset>
    </form>
    <p class="login-help"><RouterLink to="/login">已有账号或已完成注册？前往登录 →</RouterLink></p>
  </section></main>
</template>
<style scoped>fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } .field-help { color: #596d72; font-size: 13px; } </style>
