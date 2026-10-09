<script setup>
import { onBeforeUnmount, watch } from 'vue';
import api from '../api/index.js';
import { createAiRetry, retryEligible } from '../assignments/ai-retry.js';
const props = defineProps({ submission: Object, disabled: Boolean });
const emit = defineEmits(['lock', 'updated']);
// Deployment opt-in only after the maintainer verifies the connected backend/worker.
const enabled = import.meta.env.VITE_ENABLE_AI_RETRY === 'true';
const model = createAiRetry(api, { enabled, onRead: data => emit('updated', data) }), state = model.state;
watch(() => state.active, value => emit('lock', value), { flush: 'sync' });
defineExpose({ leave: model.cancel });
onBeforeUnmount(model.dispose);
</script>
<template>
  <section class="retry-panel"><h3>后台批改重试</h3><p>AI结果只是教师草稿。后台失败或未完成时，也可以直接人工评分。</p>
    <p v-if="!enabled" class="notice">此环境尚未开放后台重试，可继续人工评分。</p>
    <template v-else-if="!state.active"><p v-if="!retryEligible(submission)">仅未确认成绩且后台批改失败的记录可申请重试。</p><button :disabled="disabled || !retryEligible(submission)" @click="model.prepare(submission)">核对最新状态并准备重试</button></template>
    <template v-else><p>当前目标：{{ state.record.id }} · 最新人工重试计数：{{ state.record.ai_retry_count }}</p>
      <p v-if="state.checking || state.busy" role="status">{{ state.busy ? '正在发送一次重试申请…' : '正在读取最新状态…' }}</p>
      <p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.message" class="notice" role="status">{{ state.message }}</p>
      <template v-if="state.ready"><p>重试会交给后台处理。如果后台使用真实模型，可能产生调用费用；一次申请也可能包含后台的有限自动重试。</p><label><input v-model="state.accepted" type="checkbox" :disabled="state.busy || state.checking" /> 我已核实评分服务配置、可能费用与后台重试策略，同意申请本次重试。</label><button :disabled="!state.accepted || state.busy || state.checking" @click="model.submit">申请一次后台重试</button></template>
      <div class="actions"><button :disabled="state.busy || state.checking" @click="model.refresh">读取最新状态（至少间隔5秒）</button><button v-if="!state.ready && retryEligible(state.record)" :disabled="state.busy || state.checking" @click="model.prepare(state.record)">重新核对并准备一次重试</button><button :disabled="state.busy || state.checking" @click="model.cancel">返回详情与人工评分</button></div>
    </template>
  </section>
</template>
<style scoped>
.retry-panel { border-top: 1px solid #dbe5e0; margin-top: 24px; padding-top: 16px; } .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; } input[type="checkbox"] { width: auto; }
</style>
