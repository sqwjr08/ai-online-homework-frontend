<template>
  <div class="upload-container">
    <h2>上传题目</h2>
    <form @submit.prevent="handleUpload">
      <!-- 单元 -->
      <div class="form-item">
        <label>单元号：</label>
        <input type="number" v-model="formData.danyuan" required>
      </div>

      <!-- 题号 -->
      <div class="form-item">
        <label>题号：</label>
        <input type="number" v-model="formData.tihao" required>
      </div>

      <!-- 题干 -->
      <div class="form-item">
        <label>题干：</label>
        <textarea v-model="formData.tigan" required></textarea>
      </div>

      <!-- 图片上传 -->
      <div class="form-item">
        <label>题目图片：</label>
        <input type="file" @change="handleImageUpload" accept="image/*" multiple>
      </div>

      <!-- 标准答案 -->
      <div class="form-item">
        <label>标准答案：</label>
        <textarea v-model="formData.answer" required placeholder=""></textarea>
      </div>

      <!-- 其他信息 -->
      <div class="form-item">
        <label>其他信息：</label>
        <input type="text" v-model="formData.qita">
      </div>

      <button type="submit">提交题目</button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../api/index.js'; // 引入封装的Axios实例

// 表单数据
const formData = ref({
  danyuan: null,
  tihao: null,
  tigan: '',
  image: [], // 存储多张图片二进制数据（数组）
  answer: '',
  qita: null,
  create_time: Date.now(), // 前端生成时间戳
  status: true // 默认有效
});

// 处理图片上传
const handleImageUpload = (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    formData.value.image = []; // 清空原有图片数据
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        formData.value.image.push(new Uint8Array(event.target.result)); // 多张图片存入数组
      };
      reader.readAsArrayBuffer(file);
    });
  }
};

// 提交题目
const handleUpload = async () => {
  try {
    // 验证必填项
    if (!formData.value.tigan.trim() || !formData.value.answer.trim()) {
      alert('题干和标准答案为必填项，请填写后再提交！');
      return;
    }



    // 调用后端API（假设接口为 /api/exam/upload）
    const res = await api.post('https://localhost:443/api/exam', formData.value);
    alert('题目上传成功！');
    // 清空表单
    formData.value = {
      danyuan: null,
      tihao: null,
      tigan: '',
      image: null,
      answer: '',
      qita: null,
      create_time: Date.now(),
      status: true
    };
  } catch (error) {
    alert('上传失败：' + error.response?.data?.message || '网络错误');
  }
};
</script>

<style scoped>
.upload-container {
  max-width: 720px;
  margin: 40px auto;
  padding: 30px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.upload-container h2 {
  color: #2c3e50;
  font-size: 1.8rem;
  margin-bottom: 30px;
  text-align: center;
}

.form-item {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

label {
  width: 100px;
  color: #34495e;
  font-size: 1rem;
  flex-shrink: 0;
}

input, textarea {
  flex: 1;
  padding: 10px 15px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

input:focus, textarea:focus {
  outline: none;
  border-color: #42b983;
  box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.1);
}

textarea {
  height: 120px;
  resize: vertical;
}

button {
  width: 100%;
  padding: 12px 24px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

button:hover {
  background: #359c6f;
}

button:active {
  background: #2d825d;
}

@media (max-width: 768px) {
  .upload-container {
    margin: 20px;
    padding: 20px;
  }
  .form-item {
    flex-direction: column;
    align-items: flex-start;
  }
  label {
    margin-bottom: 8px;
  }
  input, textarea {
    width: 100%;
  }
}
</style>