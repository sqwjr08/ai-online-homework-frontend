<script setup>
import { computed } from 'vue';
import { session } from '../auth/session.js';
const content = {
  teacher: { title: '教师工作台', description: '从班级、题目到作业，安排你的教学任务。', cards: [
    ['作业', '发布班级作业，查看提交并确认成绩。'], ['题库', '整理简答题、参考答案与评分标准。'], ['班级', '管理班级码和本班学生。', '/teacher/classes'],
  ] },
  student: { title: '我的学习', description: '在这里查看班级作业，提交答案并查询成绩。', cards: [
    ['我的作业', '查看作业、提交文字答案，等待教师确认成绩。'], ['我的班级', '通过班级码加入班级，查看所属班级。', '/student/class'],
  ] },
  admin: { title: '管理工作台', description: '维护账号与班级，让教学有序进行。', cards: [
    ['账号管理', '查询与创建账号，管理启用状态和密码。', '/admin/users'], ['班级管理', '查看班级及成员，协助管理班级。'],
  ] },
};
const view = computed(() => content[session.state.user?.role]);
</script>
<template>
  <section v-if="view" class="workspace">
    <p class="eyebrow">{{ session.state.user.username }}，欢迎回来</p>
    <h1>{{ view.title }}</h1>
    <p class="muted intro">{{ view.description }}</p>
    <p v-if="session.state.storageWarning" class="notice" role="status">浏览器无法保存会话，本次可以继续使用，刷新后可能需要重新登录。</p>
    <div class="task-grid">
      <article v-for="[title, description, path] in view.cards" :key="title" class="task-card">
        <span class="availability">{{ path ? '已开放' : '暂未开放' }}</span>
        <h2><RouterLink v-if="path" :to="path">{{ title }} →</RouterLink><template v-else>{{ title }}</template></h2>
        <p class="muted">{{ description }}</p>
      </article>
    </div>
    <p class="workspace-note">已开放的功能可通过标题进入，其他功能将逐步开放。</p>
  </section>
</template>
