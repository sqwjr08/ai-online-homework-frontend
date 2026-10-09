<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import api from '../api/index.js';
import { createUsersModel, roleLabels, validateAccount } from '../accounts/users.js';
import { canManageAccount, createMaintenanceModel } from '../accounts/maintenance.js';
const maintenance = createMaintenanceModel(api);
const management = maintenance.state;
const resetForm = reactive({ password: '', confirmation: '' });
const actionPanel = ref(null);
function clearReset() { resetForm.password = ''; resetForm.confirmation = ''; }
async function openAction(user, action) {
  if (state.creating || management.target) return;
  clearReset();
  if (maintenance.open(user, action)) { await nextTick(); actionPanel.value?.focus(); }
}
async function confirmAction() {
  const result = maintenance.confirm(resetForm.password, resetForm.confirmation);
  // Keep password only for local validation failures; clear as soon as a request starts.
  if (management.busy) clearReset();
  if (await result) await model.load(1);
}
function closeAction() { if (maintenance.close()) { clearReset(); void model.load(1); } }
const model = createUsersModel(api);
const state = model.state;
const filters = reactive({ username: '', role: '', active: '' });
const form = reactive({ username: '', password: '', role: 'student', is_active: true });
const pages = computed(() => Math.max(1, Math.ceil(state.total / state.pageSize)));
function search() { state.filters = { ...filters }; void model.load(1); }
function reset() { Object.assign(filters, { username: '', role: '', active: '' }); search(); }
async function submit() {
  if (state.creating || state.uncertain || management.target) return;
  state.success = '';
  state.createError = '';
  state.fieldErrors = validateAccount(form);
  if (Object.keys(state.fieldErrors).length) return;
  const created = await model.create({ ...form });
  form.password = '';
  if (created) {
    Object.assign(filters, { username: form.username, role: '', active: '' });
    form.username = '';
    search();
  }
}
async function check() { await model.checkUncertain(); Object.assign(filters, state.filters); }
onMounted(() => model.load());
onBeforeUnmount(() => { form.password = ''; clearReset(); model.dispose(); maintenance.dispose(); });
</script>

<template>
  <main class="workspace users-page">
    <RouterLink to="/admin">← 管理工作台</RouterLink>
    <h1>账号管理</h1>
    <p class="muted">查询和创建教师或学生账号，管理启用状态与密码。管理员账号受保护。</p>
    <p v-if="management.success" class="success" role="status">{{ management.success }}</p>
    <section v-if="management.target" ref="actionPanel" tabindex="-1" class="maintenance-panel" aria-labelledby="action-title">
      <h2 id="action-title">{{ management.action === 'password' ? '重置密码' : management.target.is_active ? '停用账号' : '启用账号' }}：{{ management.target.username }}</h2>
      <p v-if="management.action === 'status'" class="muted">{{ management.target.is_active ? '停用后，该账号不能登录，旧登录令牌失效。' : '启用后可重新登录，但之前失效的登录令牌不会恢复。' }}重复设置相同状态不会再次撤销会话。请确认目标账号。</p>
      <p v-else class="muted">重置后旧登录令牌失效，需要使用新密码重新登录；不会改变账号的启用状态。密码首尾空格会保留。</p>
      <p v-if="management.error" class="error" role="alert">{{ management.error }}</p>
      <form @submit.prevent="confirmAction" :aria-busy="management.busy">
        <fieldset :disabled="management.busy || management.blocked">
          <template v-if="management.action === 'password'">
            <label for="reset-password">新密码</label><input id="reset-password" v-model="resetForm.password" type="password" autocomplete="new-password" required aria-describedby="reset-help" />
            <p id="reset-help" class="field-help">4–128个字符，不能全部为空白。发送后清空，不保存到浏览器存储。</p>
            <label for="confirm-password">再次输入新密码</label><input id="confirm-password" v-model="resetForm.confirmation" type="password" autocomplete="new-password" required />
          </template>
          <button class="primary action-confirm" type="submit">{{ management.busy ? '正在提交…' : management.action === 'password' ? '确认重置密码' : management.target.is_active ? '确认停用' : '确认启用' }}</button>
        </fieldset>
        <button type="button" :disabled="management.busy" @click="closeAction">{{ management.blocked ? '关闭并刷新列表' : '取消' }}</button>
      </form>
    </section>
    <div class="users-layout">
      <section class="users-list" aria-labelledby="users-title">
        <h2 id="users-title">账号列表</h2>
        <form class="users-filters" @submit.prevent="search">
          <div><label for="search-name">用户名搜索</label><input id="search-name" v-model="filters.username" maxlength="50" placeholder="输入用户名的一部分" /></div>
          <div><label for="filter-role">角色筛选</label><select id="filter-role" v-model="filters.role"><option value="">全部角色</option><option v-for="(label, role) in roleLabels" :value="role" :key="role">{{ label }}</option></select></div>
          <div><label for="filter-active">状态筛选</label><select id="filter-active" v-model="filters.active"><option value="">全部状态</option><option value="true">启用</option><option value="false">停用</option></select></div>
          <div class="filter-actions"><button class="primary" type="submit">查询</button><button type="button" @click="reset">重置</button></div>
        </form>
        <p class="muted small">用户名按包含关系搜索，不区分大小写；最新创建的账号优先显示。</p>
        <p v-if="state.loading" role="status">正在读取账号…</p>
        <div v-else-if="state.error" role="alert" class="error"><p>{{ state.error }}</p><button @click="model.load(state.page)">重试列表</button></div>
        <template v-else>
          <p v-if="!state.items.length" role="status" class="empty-state">没有符合条件的账号。可以调整筛选条件后重试。</p>
          <div v-else class="table-scroll" tabindex="0" role="region" aria-label="账号列表，可横向滚动">
            <table><thead><tr><th scope="col">用户名</th><th scope="col">角色</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
              <tbody><tr v-for="user in state.items" :key="user.id"><td class="user-name">{{ user.username }}</td><td>{{ roleLabels[user.role] || '未知角色' }}</td><td><span :class="['account-status', { inactive: !user.is_active }]">{{ user.is_active ? '启用' : '停用' }}</span></td><td>
                <div v-if="canManageAccount(user)" class="row-actions"><button :disabled="!!management.target || state.creating" :aria-label="`${user.is_active ? '停用' : '启用'} ${user.username}`" @click="openAction(user, 'status')">{{ user.is_active ? '停用' : '启用' }}</button><button :disabled="!!management.target || state.creating" :aria-label="`重置密码 ${user.username}`" @click="openAction(user, 'password')">重置密码</button></div>
                <span v-else class="muted">受保护</span>
              </td></tr></tbody>
            </table>
          </div>
        </template>
        <div class="pagination" aria-label="账号分页">
          <label for="page-size">每页<select id="page-size" v-model.number="state.pageSize" :disabled="state.loading" @change="model.load(1)"><option :value="20">20 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label>
          <span v-if="!state.loading && !state.error">共 {{ state.total }} 条 · 第 {{ state.page }} / {{ pages }} 页</span>
          <button :disabled="state.loading || !!state.error || state.page <= 1" @click="model.load(state.page - 1)">上一页</button>
          <button :disabled="state.loading || !!state.error || state.page >= pages || state.page >= 1000000" @click="model.load(state.page + 1)">下一页</button>
        </div>
      </section>
      <section class="create-account" aria-labelledby="create-title">
        <h2 id="create-title">创建账号</h2>
        <p class="muted small">只能创建教师或学生账号。学生加入班级需另用班级码。</p>
        <p v-if="state.success" class="success" role="status">{{ state.success }} 列表已切换为该用户名查询。</p>
        <p v-if="state.createError" class="error" role="alert">{{ state.createError }}</p>
        <button v-if="state.uncertain" type="button" :disabled="state.loading" @click="check">按用户名查询建号结果</button>
        <form @submit.prevent="submit" :aria-busy="state.creating">
          <fieldset :disabled="state.creating || !!state.uncertain || !!management.target">
            <label for="new-name">新账号用户名</label><input id="new-name" v-model="form.username" autocomplete="off" required aria-describedby="name-help name-error" :aria-invalid="!!state.fieldErrors.username" />
            <p id="name-help" class="field-help">3–50个字符，不含空白或控制字符。</p><p id="name-error" class="field-error" role="alert">{{ state.fieldErrors.username }}</p>
            <label for="new-password">初始密码</label><input id="new-password" v-model="form.password" type="password" autocomplete="new-password" required aria-describedby="password-help password-error" :aria-invalid="!!state.fieldErrors.password" />
            <p id="password-help" class="field-help">4–128个字符，不能全部为空白；首尾空格会保留。提交后清空密码。</p><p id="password-error" class="field-error" role="alert">{{ state.fieldErrors.password }}</p>
            <label for="new-role">新账号角色</label><select id="new-role" v-model="form.role"><option value="student">学生</option><option value="teacher">教师</option></select><p class="field-error" role="alert">{{ state.fieldErrors.role }}</p>
            <label for="new-active">初始状态</label><select id="new-active" v-model="form.is_active"><option :value="true">启用</option><option :value="false">停用</option></select><p class="field-error" role="alert">{{ state.fieldErrors.is_active }}</p>
            <button class="primary full" type="submit">{{ state.creating ? '正在创建…' : '创建账号' }}</button>
          </fieldset>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.users-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 28px; align-items: start; margin-top: 30px; }
.users-list, .create-account { background: white; border: 1px solid #dbe5e0; border-radius: 14px; padding: 24px; min-width: 0; }
h2 { margin-top: 0; } form { margin-top: 0; } fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.users-filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
.filter-actions { grid-column: 1 / -1; display: flex; gap: 10px; }
select { width: 100%; font: inherit; border: 1px solid #bccac6; border-radius: 8px; padding: 11px 8px; background: white; color: #182e35; }
select:focus-visible { outline: 3px solid #8cc4b5; outline-offset: 3px; }
.small, .field-help { font-size: 13px; } .field-help { color: #596d72; margin: 7px 0; }
.field-error { color: #9c302b; font-size: 13px; margin: 5px 0; } .field-error:empty { display: none; }
.table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; text-align: left; }
th { font-size: 13px; color: #596d72; background: #f4f7f7; } th, td { padding: 13px 12px; border-bottom: 1px solid #e5ebe8; }
.user-name { overflow-wrap: anywhere; min-width: 120px; } td:not(:first-child), th { white-space: nowrap; }
.account-status { color: #176958; background: #e9f3ed; padding: 3px 8px; border-radius: 5px; font-size: 13px; }
.inactive { color: #72552a; background: #faf1de; } .success { background: #e9f3ed; color: #176958; padding: 12px; border-radius: 8px; overflow-wrap: anywhere; }
.pagination { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 20px; font-size: 13px; }
.pagination label { display: flex; align-items: center; gap: 8px; margin: 0; white-space: nowrap; }
.pagination select { width: auto; padding: 6px; } .pagination button { padding: 7px 10px; }
.empty-state { padding: 30px 0; color: #596d72; }
.maintenance-panel { margin-top: 24px; padding: 24px; border: 1px solid #bdcfca; border-radius: 14px; background: white; overflow-wrap: anywhere; }
.maintenance-panel input { max-width: 440px; display: block; }
.action-confirm { margin: 20px 0 12px; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.row-actions button { padding: 6px 8px; font-size: 13px; }
@media (max-width: 960px) { .users-layout { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .users-filters { grid-template-columns: 1fr 1fr; } .users-filters > div:first-child { grid-column: 1 / -1; } .users-list, .create-account { padding: 18px; } }
</style>
