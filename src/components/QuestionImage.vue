<script setup>
import { computed, ref, watch } from 'vue';
import { imageSource } from '../questions/images.js';
const props = defineProps({ url: String, index: Number });
const source = computed(() => imageSource(props.url)), failed = ref(false);
watch(() => props.url, () => { failed.value = false; });
</script>
<template>
  <figure>
    <img v-if="source && !failed" :src="source" :alt="`题目图片 ${(index ?? 0) + 1}`" referrerpolicy="no-referrer" loading="lazy" @error="failed = true" />
    <p v-else class="error" role="status">图片 {{ (index ?? 0) + 1 }} 无法显示，题面可能不完整。{{ source ? '请检查图片服务或网络。' : '地址格式不受支持。' }}</p>
  </figure>
</template>
<style scoped>
figure { margin: 12px 0; } img { display: block; max-width: 100%; height: auto; max-height: 600px; object-fit: contain; border: 1px solid #dbe5e0; border-radius: 8px; }
</style>
