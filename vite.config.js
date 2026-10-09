import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createDevProxy } from './config/dev-proxy.js';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: createDevProxy(process.env.API_PROXY_TARGET),
  },
});
