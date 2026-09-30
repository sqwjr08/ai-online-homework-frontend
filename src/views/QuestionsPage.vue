<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import api from '../api/index.js';
import QuestionImage from '../components/QuestionImage.vue';
import QuestionImagesEditor from '../components/QuestionImagesEditor.vue';
import { createQuestionMaintenance } from '../questions/maintenance.js';
import { createQuestionsModel } from '../questions/questions.js';
const model = createQuestionsModel(api), state = model.state;
const maintenance = createQuestionMaintenance(api), edit = maintenance.state;
const search = reactive({ q: '', active: true });
const blank = () => ({ prompt: '', reference_answer: '', max_score: '', rubric: '', image_urls: [] });
const form = reactive(blank()), detailPanel = ref(null), maintenancePanel = ref(null), refreshing = ref(false);
const createUploading = ref(false), editUploading = ref(false);
const pages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
function applySearch() { state.q = search.q; state.active = search.active; void model.load(1); }
async function read(id) { const pending = model.read(id); await nextTick(); detailPanel.value?.focus(); await pending; }
async function create() {
  if (createUploading.value) return;
  if (await model.create({ ...form })) {
    Object.assign(form, blank()); Object.assign(search, { q: state.q, active: state.active });
    await nextTick(); detailPanel.value?.focus();
  }
}
async function check() { await model.checkResult(form.prompt); Object.assign(search, { q: state.q, active: state.active }); }
async function saveMaintenance() {
  if (editUploading.value) return;
  const mode = edit.mode;
  const result = await maintenance.submit();
  if (!result) return;
  refreshing.value = true;
  maintenance.close();
  state.success = mode === 'edit' ? '题目修改已保存。' : '题目已停用。';
  await model.load(1);
  await model.read(result.id);
  refreshing.value = false;
  await nextTick(); detailPanel.value?.focus();
}
async function startMaintenance(mode) {
  state.success = ''; maintenance.begin(state.detail, mode);
  await nextTick(); maintenancePanel.value?.focus();
}
onMounted(() => model.load());
onBeforeUnmount(() => { Object.assign(form, blank()); model.dispose(); maintenance.dispose(); });
</script>
<template>
  <main class="workspace questions-page">
    <RouterLink to="/teacher">← 教师工作台</RouterLink><h1>我的题库</h1>
    <p class="muted">管理自己创建的简答题。参考答案与评分标准仅供教学使用，学生不能访问此题库。</p>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <section class="panel" aria-labelledby="question-list-title">
      <fieldset :disabled="!!edit.target || refreshing"><h2 id="question-list-title">题目列表</h2>
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
    </fieldset></section>
    <section v-if="state.detailId" ref="detailPanel" tabindex="-1" class="panel" aria-labelledby="question-detail-title">
      <div class="actions"><h2 id="question-detail-title">题目详情</h2><button :disabled="!!edit.target" @click="model.closeDetail">关闭详情</button></div>
      <p v-if="state.detailLoading" role="status">正在读取详情…</p>
      <div v-else-if="state.detailError" class="error" role="alert">{{ state.detailError }} <button @click="model.read(state.detailId)">重试详情</button></div>
      <template v-else-if="state.detail">
        <p class="field-help">ID：{{ state.detail.id }} · {{ state.detail.is_active ? '启用' : '停用' }} · 满分 {{ state.detail.max_score }} 分</p>
        <h3>题干</h3><p class="question-text">{{ state.detail.prompt }}</p>
        <QuestionImage v-for="(url, index) in state.detail.image_urls" :key="`${index}:${url}`" :url="url" :index="index" />
        <h3>参考答案</h3><p class="question-text">{{ state.detail.reference_answer }}</p>
        <h3>评分标准</h3><p class="question-text">{{ state.detail.rubric ?? '未填写评分标准' }}</p>
        <p class="field-help">启用不代表可编辑。被作业引用或锁定的题目不能修改或停用，请另建新题。停用后暂无恢复入口。</p>
        <div v-if="state.detail.is_active" class="actions"><button :disabled="!!edit.target || state.creating || refreshing || createUploading" @click="startMaintenance('edit')">编辑题目</button><button :disabled="!!edit.target || state.creating || refreshing || createUploading" @click="startMaintenance('disable')">停用题目</button></div>
      </template>
    </section>
    <section v-if="edit.target" ref="maintenancePanel" tabindex="-1" class="panel" aria-labelledby="question-maintenance-title">
      <h2 id="question-maintenance-title">{{ edit.mode === 'edit' ? '编辑题目' : '确认停用' }}</h2>
      <p class="field-help">题目 ID：{{ edit.target }}。离开页面会丢失未保存输入。</p>
      <p v-if="edit.error" class="error" role="alert">{{ edit.error }}</p>
      <form @submit.prevent="saveMaintenance"><fieldset :disabled="edit.busy">
        <template v-if="edit.mode === 'edit'">
          <label for="edit-prompt">题干（1–10000字符）</label><textarea id="edit-prompt" v-model="edit.form.prompt" rows="4" required /><p v-if="edit.errors.prompt" class="error" role="alert">{{ edit.errors.prompt }}</p>
          <label for="edit-answer">参考答案（1–20000字符）</label><textarea id="edit-answer" v-model="edit.form.reference_answer" rows="4" required /><p v-if="edit.errors.reference_answer" class="error" role="alert">{{ edit.errors.reference_answer }}</p>
          <label for="edit-rubric">评分标准（选填，最多5000字符；清空可移除）</label><textarea id="edit-rubric" v-model="edit.form.rubric" rows="4" /><p v-if="edit.errors.rubric" class="error" role="alert">{{ edit.errors.rubric }}</p>
          <label for="edit-score">满分（大于零）</label><input id="edit-score" v-model="edit.form.max_score" type="number" step="any" required /><p v-if="edit.errors.max_score" class="error" role="alert">{{ edit.errors.max_score }}</p>
          <QuestionImagesEditor v-model="edit.form.image_urls" :disabled="edit.busy || edit.blocked" @uploading="editUploading = $event" />
          <p class="field-help">未调整图片时保留已有引用。多人同时修改题目可能互相覆盖，请避免同时编辑。</p>
        </template>
        <template v-else><p class="question-text">{{ edit.form.prompt }}</p><p>停用后不能作为启用题选用，目前没有恢复入口。已引用或锁定的题目可能被服务器拒绝停用。</p><label><input v-model="edit.confirmed" type="checkbox" /> 我确认停用这道题目</label></template>
        <div class="actions"><button type="submit" class="primary" :disabled="editUploading || edit.blocked || (edit.mode === 'disable' && !edit.confirmed)">{{ edit.busy ? '正在处理…' : edit.mode === 'edit' ? '保存修改' : '确认停用' }}</button><button type="button" @click="maintenance.close">{{ edit.mode === 'edit' ? '放弃输入并关闭' : '取消停用' }}</button></div>
      </fieldset></form>
      <button v-if="edit.blocked" :disabled="edit.busy" @click="maintenance.refresh">读取最新内容（保留输入）</button>
      <div v-if="edit.latest"><h3>服务器最新内容</h3><p>{{ edit.latest.is_active ? '启用' : '已停用' }} · 满分 {{ edit.latest.max_score }} 分</p><h4>题干</h4><p class="question-text">{{ edit.latest.prompt }}</p><h4>参考答案</h4><p class="question-text">{{ edit.latest.reference_answer }}</p><h4>评分标准</h4><p class="question-text">{{ edit.latest.rubric ?? '未填写' }}</p><QuestionImage v-for="(url, index) in edit.latest.image_urls" :key="`${index}:${url}`" :url="url" :index="index" /><p v-if="!edit.latest.is_active">题目已停用，请关闭本次操作。</p><button v-else-if="edit.blocked" :disabled="edit.busy" @click="maintenance.acknowledge">已核对，允许手动再次操作</button></div>
    </section>
    <section class="panel" aria-labelledby="question-create-title">
      <fieldset :disabled="!!edit.target || refreshing"><h2 id="question-create-title">创建简答题</h2><p class="muted">填写题干、参考答案和满分；评分标准可不填，可选上传题目图片。</p>
      <p v-if="state.createError" class="error" role="alert">{{ state.createError }}</p>
      <button v-if="state.uncertain" :disabled="state.loading" @click="check">按题干检索并核对结果</button>
      <form @submit.prevent="create" :aria-busy="state.creating"><fieldset :disabled="state.creating || state.uncertain">
        <label for="question-prompt">题干（1–10000字符）</label><textarea id="question-prompt" v-model="form.prompt" rows="5" required :aria-invalid="!!state.errors.prompt" /><p v-if="state.errors.prompt" class="error" role="alert">{{ state.errors.prompt }}</p>
        <label for="question-answer">参考答案（1–20000字符）</label><textarea id="question-answer" v-model="form.reference_answer" rows="5" required :aria-invalid="!!state.errors.reference_answer" /><p v-if="state.errors.reference_answer" class="error" role="alert">{{ state.errors.reference_answer }}</p>
        <label for="question-score">满分</label><input id="question-score" v-model="form.max_score" type="number" step="any" required :aria-invalid="!!state.errors.max_score" /><p v-if="state.errors.max_score" class="error" role="alert">{{ state.errors.max_score }}</p>
        <label for="question-rubric">评分标准（选填，填写后最多5000字符）</label><textarea id="question-rubric" v-model="form.rubric" rows="4" :aria-invalid="!!state.errors.rubric" /><p v-if="state.errors.rubric" class="error" role="alert">{{ state.errors.rubric }}</p>
        <QuestionImagesEditor v-model="form.image_urls" :disabled="state.creating || state.uncertain || !!edit.target || refreshing" @uploading="createUploading = $event" />
        <p class="field-help">文字去除首尾空白后校验长度。评分标准不填请留空，不要只填空格；满分必须大于零。</p>
        <button type="submit" class="primary" :disabled="createUploading">{{ state.creating ? '正在保存…' : '保存题目' }}</button>
      </fieldset></form>
    </fieldset></section>
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
input[type="checkbox"] { width: auto; margin-right: 8px; } .actions { margin-top: 12px; }
@media(max-width:600px) { .panel { padding: 18px; } .filters { flex-wrap: wrap; } .filters > div:first-child { flex-basis: 100%; } }
</style>
