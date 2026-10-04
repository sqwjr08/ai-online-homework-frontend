<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session } from '../auth/session.js';
import api from '../api/index.js';
import { createStudentResults, resultRows } from '../student/results.js';
import QuestionImage from '../components/QuestionImage.vue';
const route = useRoute(), router = useRouter(), model = createStudentResults(api, () => session.state.user?.id), state = model.state;
const kind = ref('submission'), identifier = ref('');
const rows = computed(() => resultRows(state.result, state.assignment));
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = value => value ? new Date(value).toLocaleString() : '未记录';
watch(() => [route.params.submissionId, route.params.assignmentId], ([submissionId, assignmentId]) => {
  kind.value = assignmentId ? 'assignment' : 'submission'; identifier.value = String(submissionId || assignmentId || '');
  model.load(submissionId ? { submissionId: String(submissionId) } : assignmentId ? { assignmentId: String(assignmentId) } : null);
}, { immediate: true });
onBeforeUnmount(model.dispose);
watch(() => session.state.user?.id, () => model.clear());
function lookup() {
  const id = identifier.value.trim(); if (!id) return;
  const target = kind.value === 'submission' ? { name: 'student-submission-result', params: { submissionId: id } } : { name: 'student-assignment-result', params: { assignmentId: id } };
  if (router.resolve(target).fullPath === route.fullPath) model.load(state.target); else router.push(target);
}
</script>
<template>
  <main class="workspace result-page"><RouterLink to="/student/assignments">← 我的作业</RouterLink><h1>本人答案与成绩</h1>
    <p>从“我的作业”的本人提交入口查看，或使用已保存的提交编号、作业编号查询。这里只能查看本人记录。</p>
    <p class="notice">目前没有完整历史作业列表。作业归档后会退出作业列表，可通过已保存的本页链接或编号查询本人答案与成绩；归档题面可能无法查看。</p>
    <form class="lookup" @submit.prevent="lookup"><label for="result-kind">编号类型</label><select id="result-kind" v-model="kind"><option value="submission">提交编号</option><option value="assignment">作业编号</option></select><label for="result-id">已知编号</label><input id="result-id" v-model="identifier" required maxlength="200" autocomplete="off" /><button :disabled="!identifier.trim()">查询本人记录</button></form>
    <button v-if="state.target" :disabled="state.loading || state.contentLoading" @click="model.load(state.target)">刷新本人答案与成绩</button>
    <p v-if="state.loading" role="status">正在读取本人记录…</p><p v-else-if="state.error" class="error" role="alert">{{ state.error }}</p>
    <section v-else-if="state.result" class="panel"><h2>{{ state.assignment?.title || '本人提交记录' }}</h2>
      <p>作业编号：{{ state.result.assignment_id }} · 提交编号：{{ state.result.id }}</p><p>提交时间：{{ time(state.result.submitted_at) }}（{{ zone }}）</p>
      <p><RouterLink :to="{ name: 'student-submission-result', params: { submissionId: state.result.id } }">本份提交的固定链接</RouterLink>（可收藏，打开时仍需登录本人账号）</p>
      <template v-if="state.result.status === 'confirmed'"><h3>教师已确认成绩</h3><p>总分：{{ state.result.final_total_score ?? '未记录，请联系教师' }}</p><p>确认时间：{{ time(state.result.reviewed_at) }}（{{ zone }}）</p></template>
      <p v-else class="notice">答案已保存，等待教师确认成绩。提交成功不代表后台批改完成；确认前不显示分数和评语。</p>
      <p v-if="state.contentLoading" role="status">正在读取可访问的题面…</p><p v-else-if="state.contentError" class="notice" role="status">{{ state.contentError }}</p>
      <p v-if="!rows.length" class="notice">此记录未提供逐题答案，请联系教师核对；不会补造题目或按总分推算逐题成绩。</p>
      <div v-for="(row, index) in rows" :key="index" class="answer"><h3>题目编号：{{ row.answer.question_id }}</h3>
        <template v-if="row.question"><p class="text">{{ row.question.prompt }}</p><p>满分 {{ row.question.max_score }} 分</p><QuestionImage v-for="(url, i) in row.question.image_urls" :key="`${i}:${url}`" :url="url" :index="i" /></template>
        <p v-else class="muted">暂无法唯一对应题面，以下为服务器保存的本人答案{{ state.result.status === 'confirmed' ? '与教师确认结果' : '' }}。</p>
        <h4>我的原答案</h4><p class="text">{{ row.answer.answer_text }}</p>
        <template v-if="state.result.status === 'confirmed'"><p>本题得分：{{ row.answer.final_score ?? '未记录，请联系教师' }}</p><h4>教师评语</h4><p class="text">{{ row.answer.final_comment || '未填写评语' }}</p></template>
      </div>
      <p class="muted">答案与成绩仅供查看，不能重交、撤回或覆盖。页面不保存本地成绩副本，也不会自动刷新。</p>
    </section>
  </main>
</template>
<style scoped>
.result-page { max-width: 960px; } .panel { margin: 24px 0; padding: 24px; background: white; border: 1px solid #dbe5e0; border-radius: 14px; overflow-wrap: anywhere; } .answer { border-top: 1px solid #dbe5e0; padding: 12px 0; } .text { white-space: pre-wrap; overflow-wrap: anywhere; } .lookup { margin: 24px 0; } select { font: inherit; padding: 10px; } @media(max-width:600px) { .panel { padding: 16px; } }
</style>
