<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import api from '../api/index.js';
import { onBeforeRouteLeave } from 'vue-router';
import { createStudentAssignments, deadlineText } from '../student/assignments.js';
import QuestionImage from '../components/QuestionImage.vue';
const model = createStudentAssignments(api), state = model.state;
const panel = ref(null), now = ref(Date.now());
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = value => value ? new Date(value).toLocaleString() : '不设截止时间';
let timer;
function canLeave() {
  if (state.writing || state.checking) return window.confirm('正在提交或核对结果，离开后仍可能保存成功。确认离开？');
  return !Object.values(state.answers).some(value => value.length) || window.confirm('未提交的文字将丢失，确认离开当前作业？');
}
function refresh() { if (!canLeave()) return; void model.load(); void model.loadGroup(); now.value = Date.now(); }
function close() { if (canLeave()) model.close(); }
onBeforeRouteLeave(canLeave);
function beforeUnload(event) { if (state.writing || Object.values(state.answers).some(value => value.length)) { event.preventDefault(); event.returnValue = ''; } }
async function open(id) { if (!canLeave()) return; const pending = model.open(id); await nextTick(); panel.value?.focus(); await pending; }
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); refresh(); timer = setInterval(() => { now.value = Date.now(); }, 30000); });
onBeforeUnmount(() => { clearInterval(timer); window.removeEventListener('beforeunload', beforeUnload); model.dispose(); });
</script>
<template>
  <main class="workspace student-assignments">
    <RouterLink to="/student">← 我的学习</RouterLink><h1>我的作业</h1><p><RouterLink to="/student/results">通过已保存编号查询本人答案与成绩</RouterLink></p>
    <p>查看所属班级已发布的作业及本人提交状态。每道题填写文字答案，提交后不能修改、撤回或覆盖。</p>
    <button :disabled="state.loading || state.groupLoading || state.writing || state.checking" @click="refresh">刷新作业与班级</button>
    <p v-if="state.groupLoading" role="status">正在读取所属班级…</p><p v-else-if="state.groupError" class="error" role="alert">班级信息读取失败：{{ state.groupError }}</p>
    <template v-else-if="state.groupLoaded"><p v-if="state.group">班级：{{ state.group.name }}</p><p v-else class="notice">你还没有加入班级。<RouterLink to="/student/class">前往我的班级入班</RouterLink></p><p v-if="state.group && !state.group.is_active" class="notice">班级已归档，不能新提交答案；已发布题面和本人历史提交仍按服务器权限读取。</p></template>
    <section class="panel"><h2>已发布作业</h2>
      <p v-if="state.loading" role="status">正在读取作业…</p><p v-else-if="state.error" class="error" role="alert">{{ state.error }} <button @click="refresh">重试作业列表</button></p><p v-else-if="!state.items.length">目前没有可查看的已发布作业。</p>
      <ul v-else><li v-for="item in state.items" :key="item.id"><h3>{{ item.title }}</h3><p>{{ item.questions.length }} 题 · {{ deadlineText(item.due_at, now) }}</p><p>截止：{{ time(item.due_at) }}（{{ zone }}）</p><button :disabled="state.writing || state.checking" @click="open(item.id)">查看题面与本人提交</button></li></ul>
      <p class="muted">截止提示按本机时间显示，是否允许提交最终以服务器判断为准。到期不等于归档，已截止题面仍可能可查看。</p>
    </section>
    <section v-if="state.selectedId" ref="panel" tabindex="-1" class="panel">
      <div class="actions"><h2>作业详情</h2><button :disabled="state.writing || state.checking" @click="close">关闭</button></div>
      <p v-if="state.detailLoading" role="status">正在读取题面…</p><p v-else-if="state.detailError" class="error" role="alert">{{ state.detailError }} <button :disabled="state.writing || state.checking" @click="model.readDetail">重新读取题面</button></p>
      <article v-else-if="state.detail"><h3>{{ state.detail.title }}</h3><p class="text">{{ state.detail.description || '未填写说明' }}</p><p>截止：{{ time(state.detail.due_at) }}（{{ zone }}） · {{ deadlineText(state.detail.due_at, now) }}</p>
        <form @submit.prevent="model.submit"><ol><li v-for="question in state.detail.questions" :key="question.question_id"><p class="text">{{ question.prompt }}</p><p>满分 {{ question.max_score }} 分</p><QuestionImage v-for="(url, index) in question.image_urls" :key="`${index}:${url}`" :url="url" :index="index" /><template v-if="!state.submitted || state.answers[question.question_id] !== undefined"><p v-if="state.submitted" class="notice">以下为本页保留的未保存输入，不是服务器上的答案；已查到提交，不能覆盖。</p><label :for="'answer-' + question.question_id">文字答案（1–20000字符）</label><textarea :id="'answer-' + question.question_id" v-model="state.answers[question.question_id]" rows="6" :readonly="state.submitted" :disabled="state.writing || state.checking || state.blocked" :aria-invalid="!!state.answerErrors[question.question_id]" /><p v-if="state.answerErrors[question.question_id]" class="error" role="alert">{{ state.answerErrors[question.question_id] }}</p></template></li></ol>
        <template v-if="!state.submitted"><p class="muted">输入仅保留在当前页面，关闭或刷新会丢失；不支持图片答案。截止提示只作参考，提交资格以服务器为准。</p><p v-if="state.answerErrors.form" class="error">{{ state.answerErrors.form }}</p><label><input v-model="state.confirmed" type="checkbox" :disabled="!model.canSubmit()" /> 我已核对所有答案，理解提交后不能修改、撤回或覆盖</label><p v-if="state.answerErrors.confirm" class="error">{{ state.answerErrors.confirm }}</p><button class="primary" type="submit" :disabled="!model.canSubmit() || !state.confirmed">{{ state.writing ? '正在提交…' : '提交文字答案' }}</button><p v-if="!model.canSubmit()" class="muted">请先核实题面、启用班级及本人提交状态；已有提交或结果未核实前不能再次提交。</p></template></form>
      </article>
      <p v-if="state.success" class="notice" role="status">{{ state.success }}</p><p v-if="state.writeError" class="error" role="alert">{{ state.writeError }}</p>
      <div v-if="state.blocked && !state.submitted"><button :disabled="state.writing || state.checking" @click="model.checkBeforeRetry">核对题面、班级与本人提交（保留文字）</button><button v-if="state.retryReady" :disabled="state.writing || state.checking" @click="model.allowRetry">已核对，允许手动再次提交</button></div>
      <h3>本人提交状态</h3><p v-if="state.submissionState === 'loading'" role="status">正在查询本人提交…</p>
      <p v-else-if="state.submissionState === 'error'" class="error" role="alert">查询失败，暂时无法确认是否已提交：{{ state.submissionError }}</p>
      <p v-else-if="state.submissionState === 'none'">未查到你对此作业的提交记录。这不代表作业当前允许提交。</p>
      <template v-else-if="state.submissionState === 'found'"><p>已提交 · {{ time(state.submission.submitted_at) }}</p><p>提交编号：{{ state.submission.id }}</p><p>{{ state.submission.status === 'confirmed' ? '教师已确认成绩，可查看逐题得分与评语。' : '答案已保存，等待教师确认成绩；这不代表后台批改已经完成。' }}</p><p><RouterLink :to="{ name: 'student-submission-result', params: { submissionId: state.submission.id } }">查看本人答案与成绩</RouterLink></p><p class="muted">已有答案不能重复提交覆盖，当前不提供重交或撤回。</p></template>
      <button :disabled="state.submissionState === 'loading' || state.writing || state.checking" @click="model.readSubmission">重新查询本人提交</button>
    </section>
  </main>
</template>
<style scoped>
.student-assignments { max-width: 960px; } .panel { margin: 24px 0; padding: 24px; background: white; border: 1px solid #dbe5e0; border-radius: 14px; overflow-wrap: anywhere; }
.actions { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; } li { padding: 12px 0; border-bottom: 1px solid #dbe5e0; } .text { white-space: pre-wrap; overflow-wrap: anywhere; }
textarea { width: 100%; padding: 12px; font: inherit; border: 1px solid #bccac6; border-radius: 8px; resize: vertical; } input[type="checkbox"] { width: auto; }
@media(max-width:600px) { .panel { padding: 16px; } }
</style>
