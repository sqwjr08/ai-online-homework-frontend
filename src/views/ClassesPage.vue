<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import api from '../api/index.js';
import { createClassesModel } from '../classes/classes.js';
const model = createClassesModel(api), state = model.state;
const name = ref(''), archivePanel = ref(null), membersPanel = ref(null);
const pages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
async function create() { if (await model.create(name.value)) name.value = ''; }
async function select(group) { const pending = model.select(group); await nextTick(); membersPanel.value?.focus(); await pending; }
async function requestArchive(group) { if (model.requestArchive(group)) { await nextTick(); archivePanel.value?.focus(); } }
onMounted(() => model.load());
onBeforeUnmount(() => model.dispose());
</script>

<template>
  <main class="workspace classes-page">
    <RouterLink to="/teacher">← 教师工作台</RouterLink>
    <h1>我的班级</h1>
    <p class="muted">创建班级，将班级码交给学生，查看已加入的成员。</p>
    <p v-if="state.success" class="notice" role="status">{{ state.success }}</p>
    <p v-if="state.writeError" class="error" role="alert">{{ state.writeError }}</p>
    <button v-if="state.uncertain" :disabled="state.loading" @click="model.checkResult">刷新并核对操作结果</button>
    <section v-if="state.archiveTarget" ref="archivePanel" tabindex="-1" class="panel" aria-labelledby="archive-title">
      <h2 id="archive-title">归档「{{ state.archiveTarget.name }}」</h2>
      <p>归档后不能加入新学生、创建作业、编辑或发布草稿，也不能提交新答案。已有成员和历史记录保留，教师仍可确认已有提交的成绩。</p>
      <p class="error">归档不会自动归档已有作业，目前没有恢复班级接口。请确认后再继续。</p>
      <div class="actions"><button :disabled="state.busy" @click="model.cancelArchive">取消</button><button class="primary" :disabled="state.busy" @click="model.archive">{{ state.busy ? '正在归档…' : '确认归档' }}</button></div>
    </section>
    <section class="panel" aria-labelledby="create-class-title">
      <h2 id="create-class-title">创建班级</h2>
      <form class="create-form" @submit.prevent="create">
        <div><label for="class-name">班级名称</label><input id="class-name" v-model="name" required :disabled="state.busy || state.uncertain || !!state.archiveTarget" aria-describedby="class-name-help" placeholder="例如：软件工程一班" /><p class="field-help" id="class-name-help">去除首尾空白后1–100个字符；创建后自动归属当前教师。同名班级可以存在。</p></div>
        <button class="primary" type="submit" :disabled="state.busy || state.uncertain || !!state.archiveTarget">{{ state.busy && !state.archiveTarget ? '正在创建…' : '创建班级' }}</button>
      </form>
    </section>
    <section class="panel" aria-labelledby="classes-title">
      <h2 id="classes-title">班级列表</h2>
      <div class="actions"><label for="class-filter">班级状态</label><select id="class-filter" v-model="state.filter" :disabled="state.busy || !!state.archiveTarget" @change="model.load"><option value="">全部班级</option><option value="true">使用中</option><option value="false">已归档</option></select><button :disabled="state.loading || state.busy || !!state.archiveTarget" @click="model.load">刷新列表</button></div>
      <p v-if="state.loading" role="status">正在读取班级…</p>
      <div v-else-if="state.error" class="error" role="alert">{{ state.error }} <button @click="model.load">重试</button></div>
      <p v-else-if="!state.groups.length" class="muted" role="status">没有符合条件的班级。</p>
      <div v-else class="class-grid">
        <article v-for="group in state.groups" :key="group.id" class="class-card">
          <span class="availability">{{ group.is_active ? '使用中' : '已归档' }}</span><h3>{{ group.name }}</h3>
          <p>班级码：<strong class="class-code">{{ group.code }}</strong></p>
          <p v-if="!group.is_active" class="field-help">此班级码不再接受新成员加入。</p>
          <div class="actions"><button :disabled="state.busy || !!state.archiveTarget" :aria-label="`查看成员 ${group.name} ${group.code}`" @click="select(group)">查看成员</button><button v-if="group.is_active" :disabled="state.busy || state.uncertain || !!state.archiveTarget" :aria-label="`归档 ${group.name} ${group.code}`" @click="requestArchive(group)">归档</button></div>
        </article>
      </div>
    </section>
    <section v-if="state.selected" ref="membersPanel" tabindex="-1" class="panel" aria-labelledby="members-title">
      <h2 id="members-title">{{ state.selected.name }} · 成员</h2>
      <p class="muted">班级码 {{ state.selected.code }} · {{ state.selected.is_active ? '使用中' : '已归档，仍可查看成员' }}</p>
      <div class="actions"><label for="member-filter">账号状态</label><select id="member-filter" v-model="state.memberFilter" @change="model.loadMembers(1)"><option value="">全部成员</option><option value="true">启用</option><option value="false">停用</option></select><label for="member-size">每页</label><select id="member-size" v-model.number="state.pageSize" @change="model.loadMembers(1)"><option :value="20">20条</option><option :value="50">50条</option><option :value="100">100条</option></select></div>
      <p v-if="state.membersLoading" role="status">正在读取成员…</p>
      <div v-else-if="state.membersError" class="error" role="alert">{{ state.membersError }} <button @click="model.loadMembers(state.page)">重试成员列表</button></div>
      <template v-else><p v-if="!state.members.length" class="muted" role="status">没有符合条件的成员。</p>
        <table v-else><thead><tr><th scope="col">学生用户名</th><th scope="col">账号状态</th></tr></thead><tbody><tr v-for="member in state.members" :key="member.id"><td>{{ member.username }}</td><td>{{ member.is_active ? '启用' : '停用' }}</td></tr></tbody></table>
      </template>
      <div class="actions pagination"><span v-if="!state.membersLoading && !state.membersError">符合筛选 {{ state.total }} 人 · 第 {{ state.page }} / {{ pages }} 页</span><button :disabled="state.membersLoading || !!state.membersError || state.page <= 1" @click="model.loadMembers(state.page - 1)">上一页</button><button :disabled="state.membersLoading || !!state.membersError || state.page >= pages || state.page >= 1000000" @click="model.loadMembers(state.page + 1)">下一页</button></div>
    </section>
  </main>
</template>

<style scoped>
.panel { margin-top: 24px; background: white; border: 1px solid #dbe5e0; padding: 24px; border-radius: 14px; overflow-wrap: anywhere; }
.panel h2 { margin-top: 0; } .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; } .actions label { margin: 0; }
.create-form { display: flex; align-items: center; gap: 20px; margin: 0; } .create-form > div { flex: 1; } .create-form button { flex-shrink: 0; }
.field-help { font-size: 13px; color: #596d72; } .class-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 16px; margin-top: 20px; }
.class-card { border: 1px solid #dbe5e0; border-radius: 10px; padding: 20px; min-width: 0; } .class-code { font-family: monospace; letter-spacing: 2px; user-select: all; }
select { font: inherit; border: 1px solid #bccac6; border-radius: 8px; padding: 8px; background: white; color: #182e35; } select:focus-visible { outline: 3px solid #8cc4b5; }
table { margin-top: 20px; border-collapse: collapse; width: 100%; text-align: left; table-layout: fixed; } th, td { border-bottom: 1px solid #e5ebe8; padding: 12px; overflow-wrap: anywhere; } th { background: #f4f7f7; } .pagination { margin-top: 20px; }
@media(max-width:600px) { .panel { padding: 18px; } .create-form { display: block; } }
</style>
