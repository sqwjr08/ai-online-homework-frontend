<template>
  <!-- 学生作业管理页面容器 -->
  <div class="student-page">
    <!-- 顶部导航栏 -->
    <div class="nav-bar">
      <!-- 选项卡切换区域 -->
      <div class="tabs">
        <!-- 未完成作业选项卡 -->
        <button 
          :class="['tab', { active: activeTab === 'unfinished' }]"
          @click="activeTab = 'unfinished'">
          未完成作业
        </button>
        <!-- 已完成作业选项卡 -->
        <button 
          :class="['tab', { active: activeTab === 'finished' }]"
          @click="activeTab = 'finished'">
          已完成作业
        </button>
      </div>
      <!-- 操作按钮区域 -->
      <div class="actions">
        <!-- 搜索框 -->
        <input type="text" placeholder="搜索作业" />
        <!-- 加入班级按钮 -->
        <button @click="showJoinClassDialog = true">加入班级</button>
        <!-- 退出登录按钮 -->
        <button @click="handleLogout">退出登录</button>
      </div>
    </div>

    <!-- 作业列表展示区域 -->
    <div class="assignment-list">
      <!-- 遍历作业数据，生成作业卡片 -->
      <div 
        v-for="assignment in filteredAssignments"
        :key="assignment.id"
        class="assignment-card"
        @click="viewAssignmentDetail(assignment)"
        @mouseover="hoveredAssignment = assignment.id"
        @mouseleave="hoveredAssignment = null">
        <!-- 作业名称 -->
        <h3>{{ assignment.name }}</h3>
        <!-- 截止时间 -->
        <p>截止时间：{{ formatDate(assignment.deadline) }}</p>
        <!-- 题目数量 -->
        <p>题目数量：{{ assignment.questionCount }}</p>
      </div>
    </div>

    <!-- 加入班级对话框 -->
    <div v-if="showJoinClassDialog" class="dialog-overlay">
      <div class="dialog">
        <h3>加入班级</h3>
        <!-- 班级代码输入框 -->
        <input v-model="classCode" placeholder="输入班级代码" />
        <!-- 对话框操作按钮 -->
        <div class="dialog-actions">
          <button @click="joinClass">确认</button>
          <button @click="showJoinClassDialog = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import api from '../api/index.js';
import { useRouter } from 'vue-router';
const router = useRouter();

// 状态管理
const activeTab = ref('unfinished') // 当前激活的选项卡
const showJoinClassDialog = ref(false) // 是否显示加入班级对话框
const classCode = ref('') // 班级代码输入值
const hoveredAssignment = ref(null) // 当前悬停的作业ID

// 示例数据
const assignments = ref([
  {
    id: 1,
    name: '数学作业1',
    deadline: '2023-12-31',
    questionCount: 10,
    status: 'unfinished'
  },
  {
    id: 2,
    name: '机械设计',
    deadline: '2023-12-30',
    questionCount: 10,
    status: 'unfinished'
  },
  {
    id: 1,
    name: '机械设计4',
    deadline: '2023-12-31',
    questionCount: 10,
    status: 'unfinished'
  },
  {
    id: 2,
    name: '机械设计2',
    deadline: '2023-12-30',
    questionCount: 10,
    status: 'finished'
  },
  // 更多作业数据...
])

// 计算属性：根据当前选项卡过滤作业列表
const filteredAssignments = computed(() => {
  return assignments.value.filter(a => a.status === activeTab.value)
})

// 方法：格式化日期显示
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString()
}

// 方法：查看作业详情
function viewAssignmentDetail(assignment) {
  // 跳转到作业详情页
  console.log('查看作业详情:', assignment)
}

// 方法：退出登录
const handleLogout = async () => {
  try {
    await api.post('https://localhost:443/api/logout');
    alert('退出成功');
    router.push('/login');
  } catch (error) {
    alert('退出失败：' + (error.response?.data?.msg || '网络错误'));
  }
}

// 方法：加入班级
function joinClass() {
  // 处理加入班级逻辑
  console.log('加入班级:', classCode.value)
  showJoinClassDialog.value = false
}

// 获取作业列表
const getHomeworkList = async () => {
  try {
    const res = await api.get('/homework/list', { params: { classId: 123 } });
    console.log('作业列表:', res.data);
  } catch (error) {
    console.error('获取作业列表失败:', error);
  }
};
</script>

<style scoped>
/* 页面容器样式 */
.student-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1d1d1f;
}

/* 导航栏样式 */
.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 12px 16px;
  background-color: #f5f5f7;
  border-radius: 12px;
}

/* 选项卡区域样式 */
.tabs {
  display: flex;
  gap: 8px;
}

/* 单个选项卡样式 */
.tab {
  padding: 8px 16px;
  border: none;
  background-color: transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #6e6e73;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* 激活状态的选项卡样式 */
.tab.active {
  background-color: #007aff;
  color: white;
}

/* 操作按钮区域样式 */
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 搜索框样式 */
input[type="text"] {
  padding: 8px 12px;
  border: 1px solid #d2d2d7;
  border-radius: 8px;
  font-size: 14px;
  background-color: white;
  transition: border-color 0.2s ease;
}

input[type="text"]:focus {
  border-color: #007aff;
  outline: none;
}

/* 按钮样式 */
button {
  padding: 8px 16px;
  background-color: #007aff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

button:hover {
  background-color: #0063cc;
}

/* 作业列表容器样式 */
.assignment-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* 作业卡片样式 */
.assignment-card {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background-color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* 作业卡片悬停效果 */
.assignment-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 对话框遮罩层样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 对话框样式 */
.dialog {
  background: white;
  padding: 24px;
  border-radius: 12px;
  width: 400px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

/* 对话框操作按钮区域样式 */
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
</style>