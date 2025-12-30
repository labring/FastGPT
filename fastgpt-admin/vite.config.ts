import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 添加这些配置来解决网络访问问题
    cors: true,
    hmr: {
      port: 5173,
      host: '0.0.0.0'
    }
  },
  // 忽略 Node.js 版本警告
  define: {
    __VUE_PROD_DEVTOOLS__: false,
  }
})
