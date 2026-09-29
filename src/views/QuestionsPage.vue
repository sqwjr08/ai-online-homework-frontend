<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import api from '../api/index.js';
import { createQuestionsModel } from '../questions/questions.js';
const model = createQuestionsModel(api), state = model.state;
const search = reactive({ q: '', active: true });
const blank = () => ({ prompt: '', reference_answer: '', max_score: '', rubric: '' });
const form = reactive(blank()), detailPanel = ref(null);
const pages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
function applySearch() { state.q = search.q; state.active = search.active; void model.load(1); }
async function read(id) { const pending = model.read(id); await nextTick(); detailPanel.value?.focus(); await pending; }
async function create() {
  if (await model.create({ ...form })) {
    Object.assign(form, blank()); Object.assign(search, { q: state.q, active: state.active });
    await nextTick(); detailPanel.value?.focus();
  }
}
async function check() { await model.checkResult(form.prompt); Object.assign(search, { q: state.q, active: state.active }); }
onMounted(() => model.load());
onBeforeUnmount(() => { Object.assign(form, blank()); model.dispose(); });
</script>
<template>
  <main class="workspace questions-page">
    <RouterLink to="/teacher">← 教师工作台</RouterLink><h1>我的题库</h1>
    <p class="muted">管理自己创建的简答题。参考答案与评分标准仅供教学使用，学生不能访问此题库。</p>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <section class="panel" aria-labelledby="question-list-title">
      <h2 id="question-list-title">题目列表</h2>
      <form class="filters" @submit.prevent="applySearch">
        <div><label for="question-search">搜索题干</label><input id="question-search" v-model="search.q" maxlength="200" :disabled="state.creating" placeholder="最多200字符，只搜索题干" /></div>
        <div><label for="question-status">题目状态</label><select id="question-status" v-model="search.active" :disabled="state.creating"><option :value="true">启用</option><option :value="false">停用</option></select></div>
        <button type="submit" :disabled="state.creating">查询</button>
      </form>
      <p class="field-help">按题干字面内容搜索，不区分大小写；最新创建的题目优先显示。启用和停用分别查询。</p>
      <p v-if="state.loading" role="status">正在读取题目…</p>
      <div v-else-if="state.error" class="error" role="alert">{{ state.error }} <button @click="model.load(state.page)">重试列表</button></div>
      <p v-else-if="!state.items.length" class="muted" role="status">没有符合条件的题目。</p>
      <ul v-else class="question-list"><li v-for="question in state.items" :key="question.id">
        <p class="prompt-preview">{{ question.prompt }}</p><div class="actions"><span>满分 {{ question.max_score }} 分 · {{ question.is_active ? '启用' : '停用' }}</span><button :disabled="state.creating" :aria-label="`查看题目 ${question.id}`" @click="read(question.id)">查看详情</button></div>
      </li></ul>
      <div class="actions pagination"><label for="question-size">每页</label><select id="question-size" v-model.number="state.pageSize" :disabled="state.loading || state.creating" @change="model.load(1)"><option :value="20">20条</option><option :value="50">50条</option><option :value="100">100条</option></select>
        <span v-if="!state.loading && !state.error">共 {{ state.total }} 题 · 第 {{ state.page }} / {{ pages }} 页</span>
        <button :disabled="state.loading || state.creating || !!state.error || state.page <= 1" @click="model.load(state.page - 1)">上一页</button><button :disabled="state.loading || state.creating || !!state.error || state.page >= pages || state.page >= 1000000" @click="model.load(state.page + 1)">下一页</button>
      </div>
    </section>
    <section v-if="state.detailId" ref="detailPanel" tabindex="-1" class="panel" aria-labelledby="question-detail-title">
      <div class="actions"><h2 id="question-detail-title">题目详情</h2><button @click="model.closeDetail">关闭详情</button></div>
      <p v-if="state.detailLoading" role="status">正在读取详情…</p>
      <div v-else-if="state.detailError" class="error" role="alert">{{ state.detailError }} <button @click="model.read(state.detailId)">重试详情</button></div>
      <template v-else-if="state.detail">
        <p class="field-help">ID：{{ state.detail.id }} · {{ state.detail.is_active ? '启用' : '停用' }} · 满分 {{ state.detail.max_score }} 分</p>
        <h3>题干</h3><p class="question-text">{{ state.detail.prompt }}</p>
        <h3>参考答案</h3><p class="question-text">{{ state.detail.reference_answer }}</p>
        <h3>评分标准</h3><p class="question-text">{{ state.detail.rubric ?? '未填写评分标准' }}</p>
        <p v-if="state.detail.image_urls?.length" class="notice">此题包含 {{ state.detail.image_urls.length }} 张图片；本节点仅展示文字，图片展示与上传将在18c接入，当前题面可能不完整。</p>
        <p class="field-help">题目编辑和停用将在后续节点开放。启用不代表该题未被作业引用或可以编辑。</p>
      </template>
    </section>
    <section class="panel" aria-labelledby="question-create-title">
      <h2 id="question-create-title">创建文字简答题</h2><p class="muted">填写题干、参考答案和满分；评分标准可不填。本节点不上传图片。</p>
      <p v-if="state.createError" class="error" role="alert">{{ state.createError }}</p>
      <button v-if="state.uncertain" :disabled="state.loading" @click="check">按题干检索并核对结果</button>
      <form @submit.prevent="create" :aria-busy="state.creating"><fieldset :disabled="state.creating || state.uncertain">
        <label for="question-prompt">题干（1–10000字符）</label><textarea id="question-prompt" v-model="form.prompt" rows="5" required :aria-invalid="!!state.errors.prompt" /><p v-if="state.errors.prompt" class="error" role="alert">{{ state.errors.prompt }}</p>
        <label for="question-answer">参考答案（1–20000字符）</label><textarea id="question-answer" v-model="form.reference_answer" rows="5" required :aria-invalid="!!state.errors.reference_answer" /><p v-if="state.errors.reference_answer" class="error" role="alert">{{ state.errors.reference_answer }}</p>
        <label for="question-score">满分</label><input id="question-score" v-model="form.max_score" type="number" step="any" required :aria-invalid="!!state.errors.max_score" /><p v-if="state.errors.max_score" class="error" role="alert">{{ state.errors.max_score }}</p>
        <label for="question-rubric">评分标准（选填，填写后最多5000字符）</label><textarea id="question-rubric" v-model="form.rubric" rows="4" :aria-invalid="!!state.errors.rubric" /><p v-if="state.errors.rubric" class="error" role="alert">{{ state.errors.rubric }}</p>
        <p class="field-help">文字去除首尾空白后校验长度。评分标准不填请留空，不要只填空格；满分必须大于零。</p>
        <button type="submit" class="primary">{{ state.creating ? '正在保存…' : '保存题目' }}</button>
      </fieldset></form>
    </section>
  </main>
</template>
<style scoped>
.questions-page { max-width: 1000px; } .panel { margin-top: 24px; border: 1px solid #dbe5e0; border-radius: 14px; background: white; padding: 24px; overflow-wrap: anywhere; }
h2 { margin-top: 0; } .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; } .actions h2 { margin: 0; } .pagination { margin-top: 20px; } .pagination label { margin: 0; }
.filters { display: flex; gap: 14px; align-items: end; margin: 0; } .filters > div:first-child { flex: 1; }
select, textarea { font: inherit; color: #182e35; background: white; border: 1px solid #bccac6; border-radius: 8px; padding: 10px; } textarea { display: block; width: 100%; resize: vertical; } textarea:focus-visible, select:focus-visible { outline: 3px solid #8cc4b5; outline-offset: 3px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } .field-help { font-size: 13px; color: #596d72; }
.question-list { padding: 0; list-style: none; } .question-list li { padding: 18px 0; border-bottom: 1px solid #e5ebe8; }
.prompt-preview { white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.question-text { white-space: pre-wrap; overflow-wrap: anywhere; } #question-score { max-width: 240px; }
@media(max-width:600px) { .panel { padding: 18px; } .filters { flex-wrap: wrap; } .filters > div:first-child { flex-basis: 100%; } }
</style>
