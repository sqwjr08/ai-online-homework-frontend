<script setup>
import { onBeforeUnmount, watch } from 'vue';
import api from '../api/index.js';
import { createImageUpload } from '../questions/images.js';
import QuestionImage from './QuestionImage.vue';
const props = defineProps({ modelValue: { type: Array, default: () => [] }, disabled: Boolean });
const emit = defineEmits(['update:modelValue', 'uploading']);
const model = createImageUpload(api), state = model.state;
let disposed = false;
watch(() => props.modelValue.length, length => { if (!length) state.notice = ''; });
async function select(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (props.disabled || state.busy || !file) return;
  emit('uploading', true);
  try {
    const url = await model.upload(file);
    if (url) emit('update:modelValue', [...props.modelValue, url]);
  } finally { if (!disposed) emit('uploading', false); }
}
function remove(index) {
  if (!props.disabled && !state.busy) emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
onBeforeUnmount(() => { disposed = true; model.dispose(); emit('uploading', false); });
</script>
<template>
  <div class="image-editor">
    <h3>题目图片（选填）</h3>
    <p>仅限 JPEG/PNG，每张最多 5 MiB，单边最多 10,000 像素，总像素最多 2,000 万。服务器会校验并重编码图片。</p>
    <p>图片地址公开可访问，请勿上传答案、评分标准或个人敏感信息。移除只取消题目引用，不删除已上传文件；放弃表单也不会删除文件。</p>
    <label>选择图片并上传<input type="file" accept="image/jpeg,image/png" :disabled="disabled || state.busy" @change="select" /></label>
    <p v-if="state.busy" role="status">正在检查并上传图片…</p><p v-if="state.error" class="error" role="alert">{{ state.error }}</p><p v-if="state.notice" class="notice" role="status">{{ state.notice }}</p>
    <div v-for="(url, index) in modelValue" :key="`${index}:${url}`"><QuestionImage :url="url" :index="index" /><button type="button" :disabled="disabled || state.busy" @click="remove(index)">移除图片 {{ index + 1 }} 的引用</button></div>
    <p v-if="!modelValue.length">尚未添加图片。</p>
  </div>
</template>
<style scoped>
.image-editor { margin: 20px 0; padding: 16px; border: 1px solid #dbe5e0; border-radius: 8px; } p { font-size: 14px; } input { margin-top: 8px; }
</style>
