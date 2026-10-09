<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import api from '../api/index.js';
import { createGrading, gradeable, gradeInput } from '../assignments/grading.js';
const props = defineProps({ assignment: Object, submission: Object, disabled: Boolean });
const emit = defineEmits(['lock', 'confirmed', 'checked', 'refresh']);
const model = createGrading(api, data => emit('confirmed', data), data => emit('checked', data)), state = model.state;
const eligible = computed(() => !props.disabled && gradeable(props.assignment, props.submission));
const preview = computed(() => gradeInput(state.assignment?.questions ?? [], state.fields));
watch(() => state.active, value => emit('lock', value), { flush: 'sync' });
watch(() => state.fields, () => { state.accepted = false; }, { deep: true, flush: 'sync' });
function leave() {
  if (state.busy || state.checking) return false;
  if (state.active && !state.locked && !window.confirm('离开将丢弃本页未确认的评分输入。确定离开？')) return false;
  return model.cancel();
}
defineExpose({ leave });
function cancelPanel() { if (leave()) emit('refresh'); }
onBeforeUnmount(model.dispose);
</script>
<template>
  <section class="grade-panel"><h3>人工确认成绩</h3>
    <template v-if="!state.active">
      <p v-if="submission.status === 'confirmed'">成绩已锁定，不提供更正操作。</p>
      <template v-else><p>逐题填写最终分数与评语，确认后学生即可查看。AI草稿仅供参考，无草稿也能评分。</p><button :disabled="!eligible" @click="model.begin(assignment, submission)">开始人工评分</button><p v-if="!eligible" class="error">需先完整读取可评分的题面及答案，并确保题目一一对应。</p></template>
    </template>
    <form v-else @submit.prevent="model.submit">
      <p>学生 ID：{{ state.submission.student_id }} · 提交 ID：{{ state.submission.id }}</p>
      <p v-if="state.locked" class="notice">下方保留的是本页原输入，仅供对照；实际已确认结果以上方服务器成绩为准。</p>
      <fieldset :disabled="state.busy || state.checking || state.blocked || state.locked">
        <div v-for="(question, index) in state.assignment.questions" :key="question.question_id" class="grade-row">
          <h4>第 {{ index + 1 }} 题 · 满分 {{ question.max_score }} 分</h4><p class="text">{{ question.prompt }}</p>
          <label :for="`grade-score-${index}`">最终分数</label><input :id="`grade-score-${index}`" v-model="state.fields[question.question_id].score" type="text" inputmode="decimal" autocomplete="off" :aria-describedby="`grade-error-${index}`" />
          <label :for="`grade-comment-${index}`">最终评语（选填，最多1000字）</label><textarea :id="`grade-comment-${index}`" v-model="state.fields[question.question_id].comment" rows="3" />
          <p :id="`grade-error-${index}`" class="error">{{ state.errors[question.question_id] }}</p>
        </div>
        <p>本页总分预览：{{ preview.total ?? '请完整填写有效分数' }}（最终以服务器确认为准）</p>
        <label><input v-model="state.accepted" type="checkbox" /> 我已核对所有分数与评语，确认后向学生公布，且不能更正。</label>
        <p v-if="state.errors.confirm || state.errors.form" class="error" role="alert">{{ state.errors.confirm || state.errors.form }}</p>
        <button type="submit" :disabled="!state.accepted || preview.total === null">{{ state.busy ? '正在确认…' : '确认并公布成绩' }}</button>
      </fieldset>
      <p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
      <div class="actions"><button v-if="state.blocked && !state.locked" type="button" :disabled="state.busy || state.checking" @click="model.check">{{ state.checking ? '正在查询…' : '查询最新成绩与题面' }}</button><button v-if="state.retryReady" type="button" :disabled="state.busy || state.checking" @click="model.allowRetry">已核对，继续人工评分</button><button type="button" :disabled="state.busy || state.checking" @click="cancelPanel">{{ state.locked ? '结束查看原输入' : '取消评分' }}</button></div>
    </form>
  </section>
</template>
<style scoped>
.grade-panel { margin-top: 24px; border-top: 2px solid #dbe5e0; padding-top: 16px; } fieldset { border: 0; padding: 0; min-width: 0; } .grade-row { margin: 16px 0; } .text { white-space: pre-wrap; } input[type="text"], textarea { width: 100%; box-sizing: border-box; } input[type="checkbox"] { width: auto; } .actions { display: flex; flex-wrap: wrap; gap: 12px; }
</style>
