<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../api/index.js';
import { createReviewModel, comparisonRows, reviewStatus, aiStatus, aiError } from '../assignments/review.js';
import { statusName, sourceName } from '../assignments/lifecycle.js';
import QuestionImage from '../components/QuestionImage.vue';
const route = useRoute(), model = createReviewModel(api), state = model.state, detailPanel = ref(null);
const pages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
const comparison = computed(() => comparisonRows(state.assignment, state.detail));
const time = value => value ? new Date(value).toLocaleString() : '未记录';
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
watch(() => route.params.assignmentId, id => model.select(String(id)), { immediate: true });
onBeforeUnmount(model.dispose);
async function read(id) { const pending = model.read(id); await nextTick(); detailPanel.value?.focus(); await pending; }
</script>
<template>
  <main class="workspace review-page"><RouterLink to="/teacher/assignments">← 班级作业</RouterLink><h1>提交与批改详情</h1>
    <p>查看学生原答案、AI评分草稿和教师已确认结果。AI草稿不是最终成绩；当前仅支持查看。</p>
    <section class="panel"><h2>{{ state.assignment?.title || '作业信息' }}</h2><p>作业 ID：{{ state.assignmentId }}</p>
      <p v-if="state.assignmentLoading" role="status">正在读取作业题面…</p><p v-else-if="state.assignmentError" class="error" role="alert">题面读取失败：{{ state.assignmentError }}。不会用当前题库内容替代历史题面。</p>
      <template v-else-if="state.assignment"><p>{{ statusName(state.assignment.status) }} · 内容来源：{{ sourceName(state.assignment.question_source) }}</p><p>班级 ID：{{ state.assignment.class_id }} · {{ state.assignment.questions.length }} 题</p><p v-if="state.assignment.question_source !== 'snapshot'" class="notice">此作业内容不是发布快照，请按实际来源核对，不能视为发布时保存的题面。</p></template>
      <button :disabled="state.assignmentLoading" @click="model.loadAssignment">重新读取作业题面</button>
    </section>
    <section class="panel"><h2>提交列表</h2><div v-if="state.progress" class="notice" role="status">本作业已提交 {{ state.progress.submitted_count }} 份 · 待教师确认 {{ state.progress.pending_count }} 份 · 已确认 {{ state.progress.confirmed_count }} 份</div>
      <p class="muted">统计为整份作业的提交情况，不随筛选变化；不是AI完成率，也不代表全班人数。接口未提供学生姓名，此处使用学生ID。</p>
      <div class="actions"><label for="review-filter">人工状态</label><select id="review-filter" v-model="state.filter" @change="model.load(1)"><option value="">全部</option><option value="pending_teacher_review">待教师确认</option><option value="confirmed">已确认</option></select><button :disabled="state.loading" @click="model.load(state.page)">刷新提交列表</button></div>
      <p v-if="state.loading" role="status">正在读取提交…</p><p v-else-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-else-if="!state.items.length">没有符合条件的提交。</p>
      <ul v-else><li v-for="item in state.items" :key="item.id"><p>学生 ID：{{ item.student_id }}</p><p>{{ reviewStatus(item.status) }} · {{ aiStatus(item.ai_status) }}</p><p>提交：{{ time(item.submitted_at) }}（{{ zone }}）</p><p v-if="item.status === 'confirmed'">教师确认总分：{{ item.final_total_score ?? '未记录' }}</p><button @click="read(item.id)">查看答案与批改详情</button></li></ul>
      <div class="actions"><label for="review-size">每页</label><select id="review-size" v-model.number="state.pageSize" :disabled="state.loading" @change="model.load(1)"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><span>筛选后 {{ state.total }} 份 · 第 {{ state.page }} / {{ pages }} 页</span><button :disabled="state.loading || !!state.error || state.page <= 1" @click="model.load(state.page - 1)">上一页</button><button :disabled="state.loading || !!state.error || state.page >= pages || state.page >= 1000000" @click="model.load(state.page + 1)">下一页</button></div>
    </section>
    <section v-if="state.selectedId" ref="detailPanel" tabindex="-1" class="panel"><div class="actions"><h2>提交详情</h2><button @click="model.close">关闭详情</button><button :disabled="state.detailLoading" @click="model.read(state.selectedId)">刷新此提交</button></div>
      <p v-if="state.detailLoading" role="status">正在读取最新提交…</p><p v-else-if="state.detailError" class="error" role="alert">{{ state.detailError }}</p>
      <template v-else-if="state.detail"><p>提交 ID：{{ state.detail.id }} · 学生 ID：{{ state.detail.student_id }}</p><p>{{ reviewStatus(state.detail.status) }} · {{ aiStatus(state.detail.ai_status) }}</p>
        <p>AI草稿总分：{{ state.detail.ai_total_score ?? '尚无草稿分数' }}（仅供教师参考）</p><p v-if="state.detail.status === 'confirmed'">教师最终总分：{{ state.detail.final_total_score ?? '未记录' }} · 确认时间：{{ time(state.detail.reviewed_at) }}（{{ zone }}） · 确认人 ID：{{ state.detail.reviewed_by ?? '未记录' }}。成绩已锁定，目前没有更正入口。</p><p v-else class="notice">最终成绩尚未确认，学生看不到AI草稿。AI失败或尚无结果不妨碍后续人工评分。</p>
        <p>后台尝试 {{ state.detail.ai_attempts }} 次 · 人工重试 {{ state.detail.ai_retry_count }} 次 · 下次后台尝试：{{ time(state.detail.ai_next_attempt_at) }}（{{ zone }}）</p><p>AI错误：{{ aiError(state.detail.ai_error_code) }}</p><p class="muted">页面不会自动刷新、触发批改或重试。接口未提供实际评分服务商/模型，不能仅凭草稿判定来自真实大模型。</p>
        <ol><li v-for="(row, index) in comparison.rows" :key="index"><h3>第 {{ index + 1 }} 题 · 满分 {{ row.question.max_score }} 分</h3><p class="text">{{ row.question.prompt }}</p><QuestionImage v-for="(url, i) in row.question.image_urls" :key="`${i}:${url}`" :url="url" :index="i" /><details><summary>参考答案与评分标准</summary><p class="text">{{ row.question.reference_answer }}</p><p class="text">{{ row.question.rubric ?? '未填写评分标准' }}</p></details>
          <p v-if="row.mismatch" class="error">题目与答案无法唯一对应，请联系维护者核对；不会按数组位置猜测答案。</p>
          <template v-else><h4>学生答案</h4><p class="text">{{ row.answer.answer_text }}</p><h4>AI草稿（非最终成绩）</h4><p>分数：{{ row.answer.ai_score ?? '暂无' }}</p><p class="text">{{ row.answer.ai_comment ?? '暂无评语' }}</p><template v-if="state.detail.status === 'confirmed'"><h4>教师已确认结果</h4><p>分数：{{ row.answer.final_score ?? '未记录' }}</p><p class="text">{{ row.answer.final_comment ?? '未填写评语' }}</p></template></template>
        </li></ol>
        <div v-if="comparison.unmatched.length" class="notice"><h3>暂无法对照题面的答案</h3><p>题面缺失或引用不匹配。以下仅展示提交原文，不据当前题库补题。</p><div v-for="(answer, i) in comparison.unmatched" :key="i"><p>题目 ID：{{ answer.question_id }}</p><p class="text">{{ answer.answer_text }}</p></div></div>
      </template>
    </section>
  </main>
</template>
<style scoped>
.review-page { max-width: 1050px; } .panel { margin: 24px 0; padding: 24px; border: 1px solid #dbe5e0; background: white; border-radius: 14px; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; } li { padding: 14px 0; border-bottom: 1px solid #dbe5e0; } .text { white-space: pre-wrap; overflow-wrap: anywhere; } select { font: inherit; padding: 10px; } .actions label { margin: 0; }
@media(max-width:600px) { .panel { padding: 16px; } }
</style>
