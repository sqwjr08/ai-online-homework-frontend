<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { session } from '../auth/session.js';
import { createStudentClassModel } from '../student/my-class.js';
const model = createStudentClassModel(session.api, session.refreshUser), state = model.state;
const code = ref('');
async function join() { if (await model.join(code.value)) code.value = ''; }
onMounted(() => model.load());
onBeforeUnmount(() => model.dispose());
</script>
<template>
  <main class="workspace my-class">
    <RouterLink to="/student">← 我的学习</RouterLink><h1>我的班级</h1>
    <p class="muted">每位学生最多属于一个班级，加入前请核对教师提供的班级码。当前不支持退班或转班。</p>
    <button :disabled="state.loading || state.joining" @click="model.load">刷新当前班级</button>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <p v-if="state.joinError" class="error" role="alert">{{ state.joinError }}</p>
    <p v-if="state.loading" role="status">正在核实所属班级…</p>
    <p v-else-if="state.error" class="error" role="alert">{{ state.error }} 请刷新重试。</p>
    <section v-else-if="state.loaded && state.group" class="class-panel" aria-labelledby="my-class-title">
      <span class="availability">{{ state.group.is_active ? '使用中' : '已归档' }}</span><h2 id="my-class-title">{{ state.group.name }}</h2>
      <p>班级码：<strong>{{ state.group.code }}</strong></p>
      <p v-if="!state.group.is_active" class="notice">班级已归档，所属关系仍保留，不能加入另一个班级。新答案提交已停止；历史查询范围以后端接口为准。</p>
      <p class="muted">已加入班级，无需再次提交班级码。</p>
    </section>
    <section v-else-if="state.loaded" class="class-panel" aria-labelledby="join-title">
      <h2 id="join-title">{{ state.requiresCheck ? '请先核实入班结果' : '你还没有加入班级' }}</h2>
      <form @submit.prevent="join" :aria-busy="state.joining">
        <label for="join-code">班级码</label><input id="join-code" v-model="code" autocomplete="off" autocapitalize="characters" required :disabled="state.joining || state.requiresCheck" aria-describedby="join-help" />
        <p id="join-help" class="muted">6位字母或数字，自动去除首尾空白并转为大写。每位学生只能属于一个班级，请核对无误后提交。</p>
        <button type="submit" class="primary" :disabled="state.joining || state.requiresCheck">{{ state.joining ? '正在加入…' : '确认加入班级' }}</button>
      </form>
    </section>
  </main>
</template>
<style scoped>.my-class { max-width: 800px; } .class-panel { margin-top: 24px; border: 1px solid #dbe5e0; padding: 24px; border-radius: 14px; background: white; overflow-wrap: anywhere; } strong { font-family: monospace; letter-spacing: 2px; } input { max-width: 320px; } </style>
