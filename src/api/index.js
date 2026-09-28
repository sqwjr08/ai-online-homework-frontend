import axios from 'axios';

// 创建Axios实例
const service = axios.create({  
  withCredentials: true, // 携带cookie跨域
  baseURL: import.meta.env.VITE_API_BASE_URL, // 从环境变量获取API基地址（需在vite.config.js中配置）
  timeout: 5000 // 请求超时时间
});

// 请求拦截器：添加认证token等公共参数
service.interceptors.request.use(
  (config) => {
    // 示例：从Vuex获取用户token
    // const token = store.state.user.token;
    // if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  },
  (error) => {
    console.error('请求拦截器错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器：处理业务错误码/网络错误
service.interceptors.response.use(
  (response) => {
    const res = response.data;
    // 示例：假设后端返回code=200为成功
    if (res.code !== 200) {
      alert(res.message || '请求失败');
      return Promise.reject(new Error(res.message || 'Error'));
    }
    return res;
  },
  (error) => {
    console.error('响应拦截器错误:', error.response?.data || error.message);
    alert('网络请求失败，请稍后重试');
    return Promise.reject(error);
  }
);

export default service;