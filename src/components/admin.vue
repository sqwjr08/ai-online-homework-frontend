<template>
  <div class="admin-container">
    <h2>管理员主页</h2>
    <div class="button-group">
      <router-link :to="{ name: 'Upload' }" class="admin-btn">上传题目</router-link>
      <button class="admin-btn" @click="handleCreateHomework">作业管理</button>
      <button class="admin-btn" @click="handleViewStudents">查看学生</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// 作业管理点击事件（示例，后续可扩展）
const handleCreateHomework = () => {
  // 这里可以跳转到作业管理页面（需先配置路由）
  // router.push('/build')
  alert('功能开发中：跳转到作业管理页面');
};

// 查看学生点击事件（示例，后续可扩展）
const handleViewStudents = () => {
  // 这里可以跳转到学生管理页面（需先配置路由）
  // router.push('/manage')
  alert('功能开发中：跳转到学生管理页面');
};
</script>

<style scoped>
.admin-container {
  max-width: 720px;
  margin: 40px auto;
  padding: 30px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.admin-container h2 {
  color: #2c3e50;
  font-size: 1.8rem;
  margin-bottom: 30px;
  text-align: center;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
}

.admin-btn {
  width: 240px;
  padding: 12px 24px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
  text-align: center;
  text-decoration: none;
}

.admin-btn:hover {
  background: #359c6f;
}

.admin-btn:active {
  background: #2d825d;
}
</style>