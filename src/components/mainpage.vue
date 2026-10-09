<template>
  <!-- 主页面容器 -->
  <div class="home-container">
    <!-- 页面标题 -->
    <h1>机械设计课后习题</h1>
    <!-- 登录按钮 -->
    <button @click="navigateToLogin">登录</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { onMounted } from 'vue';
import api from '../api/index.js';
const router = useRouter();

// 检查登录状态并跳转
const checkLogin = async () => {
  try {
    const res = await api.get('https://localhost:443/api/check-login'); // 调用后端验证登录接口
    if (res.code === 200) { // 假设后端返回code=200表示已登录
      router.push('/student'); // 跳转到学生主页
    }
  } catch (error) {
    // 未登录或接口错误时不跳转
    console.log('未登录或验证失败:', error.message);
  }
};

onMounted(() => {
  checkLogin(); // 页面挂载时执行检查
});

// 导航到登录页面的函数
const navigateToLogin = () => {
  router.push('/login');
}
</script>

<style scoped>
/* 主页容器样式 */
.home-container {
  /* 设置背景图片 */
  background-image: url('assets/background.jpg');
  /* 背景图片覆盖整个容器 */
  background-size: cover;
  /* 背景图片居中 */
  background-position: center;
  /* 容器高度占满整个视口 */
  height: 100vh;
  /* 使用flex布局，垂直排列 */
  display: flex;
  flex-direction: column;
  /* 内容垂直居中 */
  justify-content: center;
  /* 内容水平居中 */
  align-items: center;
  /* 移除默认外边距 */
  margin: 0;
  /* 移除默认内边距 */
  padding: 0;
}

/* 标题样式 */
h1 {
  /* 文字颜色 */
  color: rgba(255, 255, 255, 0.978);
  /* 字体大小 */
  font-size: 4rem;
  /* 字体粗细 */
  font-weight: 600;
  /* 字体族 */
  font-family: 'SimHei', 'Microsoft YaHei', sans-serif;
  /* 下边距 */
  margin-bottom: 30px;
  /* 文字阴影 */
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

/* 按钮样式 */
button {
  /* 内边距 */
  padding: 20px 40px;
  /* 背景颜色 */
  background-color: #459fff4e;
  /* 文字颜色 */
  color: white;
  /* 移除边框 */
  border: none;
  /* 圆角 */
  border-radius: 8px;
  /* 鼠标指针样式 */
  cursor: pointer;
  /* 字体大小 */
  font-size: 1rem;
  /* 字体粗细 */
  font-weight: 500;
  /* 背景颜色过渡效果 */
  transition: background-color 0.2s;
}

/* 按钮悬停样式 */
button:hover {
  /* 悬停时背景颜色 */
  background-color: #1687ff;
}
</style>