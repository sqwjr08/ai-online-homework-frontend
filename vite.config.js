// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({ 
  plugins: [vue()],
  server: { 
    https: { 
      key: path.resolve(__dirname, 'localhost+2-key.pem'), // 私钥路径
      cert: path.resolve(__dirname, 'localhost+2.pem')    // 证书路径
    },
    port: 5173 // 默认端口
  }
});