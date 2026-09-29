<script setup>
import { computed } from 'vue';
import { session } from '../auth/session.js';
const content = {
  teacher: { title: '教师工作台', description: '从班级、题目到作业，安排你的教学任务。', cards: [
    ['作业', '发布班级作业，查看提交并确认成绩。'], ['题库', '整理简答题、参考答案与评分标准。'], ['班级', '管理班级码和本班学生。'],
  ] },
  student: { title: '我的学习', description: '在这里查看班级作业，提交答案并查询成绩。', cards: [
    ['我的作业', '查看作业、提交文字答案，等待教师确认成绩。'], ['我的班级', '通过班级码加入班级，查看所属班级。'],
  ] },
  admin: { title: '管理工作台', description: '维护账号与班级，让教学有序进行。', cards: [
    ['账号管理', '创建教师或学生账号，管理账号状态与密码。'], ['班级管理', '查看班级及成员，协助管理班级。'],
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
      <article v-for="[title, description] in view.cards" :key="title" class="task-card">
        <span class="availability">暂未开放</span>
        <h2>{{ title }}</h2>
        <p class="muted">{{ description }}</p>
      </article>
    </div>
    <p class="workspace-note">当前可使用登录与账号身份入口。其他功能开放后会在这里显示。</p>
  </section>
</template>
