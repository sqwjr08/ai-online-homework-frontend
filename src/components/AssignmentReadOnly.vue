<script setup>
import QuestionImage from './QuestionImage.vue';
import { statusName, sourceName } from '../assignments/lifecycle.js';
defineProps({ assignment: { type: Object, required: true }, classLabel: String });
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
</script>
<template>
  <article>
    <h3>{{ assignment.title }}</h3>
    <p>ID：{{ assignment.id }} · {{ statusName(assignment.status) }}</p>
    <p>{{ classLabel || `班级 ID：${assignment.class_id}` }}</p>
    <p>内容来源：{{ sourceName(assignment.question_source) }}</p>
    <p>截止时间：{{ assignment.due_at ? new Date(assignment.due_at).toLocaleString() : '不设截止时间' }}（{{ zone }}）</p>
    <p class="text">{{ assignment.description || '未填写说明' }}</p>
    <ol><li v-for="question in assignment.questions" :key="question.question_id">
      <p class="text">{{ question.prompt }}</p><p>满分 {{ question.max_score }} 分 · 题目 ID：{{ question.question_id }}</p>
      <QuestionImage v-for="(url, index) in question.image_urls" :key="`${index}:${url}`" :url="url" :index="index" />
      <details><summary>参考答案与评分标准（教师可见）</summary><p class="text">{{ question.reference_answer }}</p><p class="text">{{ question.rubric ?? '未填写评分标准' }}</p></details>
    </li></ol>
  </article>
</template>
<style scoped>
.text { white-space: pre-wrap; overflow-wrap: anywhere; } li { padding: 12px 0; border-bottom: 1px solid #dbe5e0; }
</style>
