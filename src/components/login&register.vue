<template>
  <!-- 登录/注册页面容器 -->
   <div class="home-container"></div>
  <div class="container">
    <!-- 页面标题，根据isLogin状态显示登录或注册 -->
    
    <h2>{{ isLogin ? '登录' : '注册' }}</h2>

    <!-- 登录表单，当isLogin为true时显示 -->
    <form v-if="isLogin" @submit.prevent="handleLogin">
      <!-- 用户名输入框 -->
      <input v-model="loginData.username" placeholder="用户名" required />
      <!-- 密码输入框 -->
      <input v-model="loginData.password" type="password" placeholder="密码" required />
      <!-- 登录按钮 -->
      <button type="submit">登录</button>
    </form>

    <!-- 注册表单，当isLogin为false时显示 -->
    <form v-else @submit.prevent="handleRegister">
      <!-- 用户名输入框 -->
      <input v-model="registerData.username" placeholder="用户名" required />
      <!-- 密码输入框 -->
      <input v-model="registerData.password" type="password" placeholder="密码" required />
      <!-- 确认密码输入框 -->
      <input v-model="registerData.confirmPassword" type="password" placeholder="确认密码" required />
      <!-- 注册按钮 -->
      <button type="submit">注册</button>
    </form>

    <!-- 切换登录/注册的链接 -->
    <div class="switch" @click="toggleForm">
      {{ isLogin ? '切换到注册' : '切换到登录' }}
    </div>
  </div>
</template>

<script setup>
// 导入Vue的ref函数
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// 控制当前显示的是登录还是注册表单
const isLogin = ref(true)
const router = useRouter()

// 登录表单数据
const loginData = ref({
  username: '',
  password: ''
})

// 注册表单数据
const registerData = ref({
  username: '',
  password: '',
  confirmPassword: ''
})

// 切换登录/注册表单
function toggleForm() {
  isLogin.value = !isLogin.value
}

// 处理登录请求
async function handleLogin() {
  try {
    // 发送登录请求（使用HTTPS+正确端口）
    const res = await fetch('https://localhost:443/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginData.value),
      credentials: 'include' // 启用跨域携带凭证
    })

    // 解析响应数据
    const data = await res.json()
    if (res.ok) {
  alert('登录成功')
  // 根据用户角色跳转到不同页面
  console.log('Role from backend:', data.data.role) // 注意访问data.data.role
  if (data.data.role === 'admin') {
    router.push('/admin')
  } else {
    router.push('/student')
  }
} else {
      alert(data.message || '登录失败')
    }
  } catch (err) {
    alert('登录请求失败')
    console.error(err)
  }
}

// 处理注册请求
async function handleRegister() {
  // 检查两次输入的密码是否一致
  if (registerData.value.password !== registerData.value.confirmPassword) {
    alert('两次输入的密码不一致')
    return
  }

  try {
    // 发送注册请求（使用HTTPS+正确端口）
    const res = await fetch('https://localhost:443/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: registerData.value.username,
        password: registerData.value.password
      }),
      credentials: 'include' // 启用跨域携带凭证
    })

    // 解析响应数据
    const data = await res.json()
    if (res.ok) {
      alert('注册成功')
      // 注册成功后切换到登录表单
      isLogin.value = true
    } else {
      alert(data.message || '注册失败')
    }
  } catch (err) {
    alert('注册请求失败')
    console.error(err)
  }
}
</script>

<style scoped>

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
/* 容器样式 */
.container {
  background-color: #ffffffa7;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  width: 320px;
  text-align: center;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 输入框样式 */
input {
  width: 100%;
  padding: 12px;
  margin: 8px 0;
  border: 1px solid #d1d1d6;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}

/* 输入框聚焦样式 */
input:focus {
  border-color: #007aff;
  outline: none;
}

/* 按钮样式 */
button {
  width: 100%;
  padding: 12px;
  background-color: #007aff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 16px;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}

/* 按钮悬停样式 */
button:hover {
  background-color: #0063cc;
}

/* 切换链接样式 */
.switch {
  margin-top: 20px;
  color: #007aff;
  cursor: pointer;
  font-size: 13px;
  transition: color 0.2s;
}

/* 切换链接悬停样式 */
.switch:hover {
  color: #0063cc;
}

/* 标题样式 */
h2 {
  color: #1c1c1e;
  margin-bottom: 24px;
  font-size: 20px;
  font-weight: 600;
}
</style>
