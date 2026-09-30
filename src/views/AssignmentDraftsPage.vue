<script setup>
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from 'vue';
import api from '../api/index.js';
import { createDraftsModel } from '../assignments/drafts.js';
import { createQuestionsModel } from '../questions/questions.js';
import QuestionImage from '../components/QuestionImage.vue';
const model = createDraftsModel(api), state = model.state;
const picker = createQuestionsModel(api), questions = picker.state;
const editorPanel = ref(null);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const pages = computed(() => Math.max(1, Math.ceil(questions.total / questions.pageSize)));
const readonly = computed(() => state.busy || state.blocked || state.status !== 'draft');
const className = id => state.groups.find(g => g.id === id)?.name ?? `班级 ID：${id}（可能已归档）`;
const time = value => value ? new Date(value).toLocaleString() : '无截止时间';
onMounted(() => { void model.load(); void model.loadGroups(); });
onBeforeUnmount(() => { model.dispose(); picker.dispose(); });
async function begin() { model.begin(); void picker.load(1); await nextTick(); editorPanel.value?.focus(); }
async function open(id) { await model.open(id); if (state.form && state.status === 'draft') void picker.load(1); await nextTick(); editorPanel.value?.focus(); }
</script>
<template>
  <main class="workspace drafts-page">
    <RouterLink to="/teacher">← 教师工作台</RouterLink><h1>作业草稿</h1>
    <p>草稿对学生不可见。此处保存草稿，发布、归档及提交查看将在后续节点开放。</p>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <section class="panel"><h2>已保存草稿</h2>
      <div class="actions"><button :disabled="state.loading || state.busy" @click="model.load">刷新列表</button><button :disabled="!!state.form || state.reading" @click="begin">新建草稿</button></div>
      <p v-if="state.loading" role="status">正在读取草稿…</p><p v-else-if="state.listError" class="error" role="alert">{{ state.listError }}</p>
      <p v-else-if="!state.items.length">暂无草稿。</p>
      <ul v-else><li v-for="item in state.items" :key="item.id"><strong>{{ item.title }}</strong><p>{{ className(item.class_id) }} · {{ item.questions.length }} 题 · {{ time(item.due_at) }}</p><p class="muted">ID：{{ item.id }}</p><button :disabled="!!state.form || state.reading || state.busy" @click="open(item.id)">打开草稿</button></li></ul>
      <p class="muted">接口返回全部草稿，当前没有服务端分页或标题搜索。</p>
    </section>
    <p v-if="state.reading" role="status">正在读取最新草稿…</p><p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
    <section v-if="state.form" ref="editorPanel" tabindex="-1" class="panel"><h2>{{ state.id ? '编辑草稿' : '新建草稿' }}</h2>
      <p v-if="state.status !== 'draft'" class="notice">当前作业已不是草稿（{{ state.status }}），仅供查看，不能编辑或延期。</p>
      <p>保存草稿即永久锁定所选题目的内容与停用操作，移除引用也不会解锁；保存失败也可能留下题目锁。请先在题库确认题目。</p>
      <p class="muted">离开或关闭本表单会丢失未保存输入。编辑已保存草稿时不能更换班级。</p>
      <form @submit.prevent="model.save"><fieldset :disabled="readonly">
        <label for="draft-title">标题（1–200字符）</label><input id="draft-title" v-model="state.form.title" required /><p v-if="state.errors.title" class="error">{{ state.errors.title }}</p>
        <label for="draft-description">说明（选填）</label><textarea id="draft-description" v-model="state.form.description" rows="3" />
        <label for="draft-class">班级</label><p v-if="state.id">{{ className(state.form.class_id) }}</p>
        <select v-else id="draft-class" v-model="state.form.class_id" :disabled="state.groupsLoading || !!state.groupsError" required><option value="">请选择启用班级</option><option v-for="group in state.groups" :key="group.id" :value="group.id">{{ group.name }}</option></select>
        <p v-if="state.groupsLoading">正在读取班级…</p><p v-else-if="state.groupsError" class="error">{{ state.groupsError }}</p><p v-else-if="!state.groups.length">暂无启用班级，请先在班级管理中创建。</p><button type="button" :disabled="state.groupsLoading" @click="model.loadGroups">刷新班级</button><p v-if="state.errors.class_id" class="error">{{ state.errors.class_id }}</p>
        <label for="draft-due">截止时间（选填，本地时区 {{ zone }}）</label><input id="draft-due" v-model="state.form.due" type="datetime-local" step="0.001" /><p v-if="state.errors.due" class="error">{{ state.errors.due }}</p><p class="muted">留空表示不设截止时间，保存时转换为UTC。草稿允许过去的截止时间，但发布前需要调整；最终以服务器判断为准。</p>
        <h3>已选题目（按下列顺序保存）</h3><p v-if="!state.form.questions.length">请从下方题库添加至少一道题。</p>
        <ol><li v-for="(item, index) in state.form.questions" :key="item.question_id"><p class="question-text">{{ item.prompt }}</p><p>满分 {{ item.max_score }} 分 · ID：{{ item.question_id }}</p><QuestionImage v-for="(url, i) in item.image_urls" :key="`${i}:${url}`" :url="url" :index="i" /><details><summary>参考答案和评分标准（教师可见）</summary><p class="question-text">{{ item.reference_answer }}</p><p class="question-text">{{ item.rubric ?? '未填写评分标准' }}</p></details><div class="actions"><button type="button" :disabled="index === 0" @click="model.move(index, -1)">上移</button><button type="button" :disabled="index === state.form.questions.length - 1" @click="model.move(index, 1)">下移</button><button type="button" @click="model.remove(index)">移除引用</button></div></li></ol>
        <p v-if="state.errors.questions" class="error">{{ state.errors.questions }}</p>
        <label><input v-model="state.lockAcknowledged" type="checkbox" /> 我理解保存草稿会永久锁定所选题目</label><p v-if="state.errors.lock" class="error">{{ state.errors.lock }}</p>
        <button type="submit" class="primary">{{ state.busy ? '正在保存…' : '保存草稿（不发布）' }}</button>
      </fieldset></form>
      <button :disabled="state.busy" @click="model.close">放弃未保存输入并关闭</button>
      <div v-if="state.blocked"><button :disabled="state.busy" @click="model.check">读取最新状态（保留输入）</button>
        <div v-if="state.latest"><h3>服务器最新内容</h3><p>{{ state.latest.title }} · {{ state.latest.status }} · {{ time(state.latest.due_at) }}</p><p class="question-text">{{ state.latest.description }}</p><ol><li v-for="item in state.latest.questions" :key="item.question_id"><p class="question-text">{{ item.prompt }}</p><p>ID：{{ item.question_id }} · {{ item.max_score }} 分</p><QuestionImage v-for="(url, i) in item.image_urls" :key="`${i}:${url}`" :url="url" :index="i" /></li></ol></div>
        <p v-else-if="state.checked">请核对上方全部草稿列表。可先关闭当前表单，再打开对应草稿核对详情；不要仅凭同标题判定保存成功。</p>
        <button v-if="state.checked && (!state.id || state.latest?.status === 'draft')" :disabled="state.busy" @click="model.acknowledge">已核对，允许手动再次保存</button>
      </div>
    </section>
    <section v-if="state.form && state.status === 'draft'" class="panel"><h2>从启用题库添加</h2><fieldset :disabled="readonly">
      <form class="actions" @submit.prevent="picker.load(1)"><label for="draft-search">搜索题干</label><input id="draft-search" v-model="questions.q" maxlength="200" /><button>查询</button></form>
      <p v-if="questions.loading">正在读取题库…</p><p v-else-if="questions.error" class="error">{{ questions.error }} <button @click="picker.load(questions.page)">重试</button></p><p v-else-if="!questions.items.length">暂无符合条件的启用题目。</p>
      <ul v-else><li v-for="item in questions.items" :key="item.id"><p class="question-text">{{ item.prompt }}</p><p>满分 {{ item.max_score }} 分 · {{ item.image_urls.length }} 张图片</p><button :disabled="state.form.questions.some(q => q.question_id === item.id)" @click="model.add(item)">{{ state.form.questions.some(q => q.question_id === item.id) ? '已添加' : '添加题目' }}</button></li></ul>
      <div class="actions"><span>第 {{ questions.page }} / {{ pages }} 页 · 每页20题</span><button :disabled="questions.loading || !!questions.error || questions.page <= 1" @click="picker.load(questions.page - 1)">上一页</button><button :disabled="questions.loading || !!questions.error || questions.page >= pages" @click="picker.load(questions.page + 1)">下一页</button></div>
    </fieldset></section>
  </main>
</template>
<style scoped>
.drafts-page { max-width: 1000px; } .panel { margin: 24px 0; padding: 24px; border: 1px solid #dbe5e0; border-radius: 14px; background: white; overflow-wrap: anywhere; }
.actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin: 12px 0; } li { padding: 12px 0; border-bottom: 1px solid #dbe5e0; } .question-text { white-space: pre-wrap; overflow-wrap: anywhere; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } textarea, select { width: 100%; padding: 10px; font: inherit; border: 1px solid #bccac6; border-radius: 8px; } input[type="checkbox"] { width: auto; } summary { cursor: pointer; }
@media(max-width:600px) { .panel { padding: 16px; } }
</style>
