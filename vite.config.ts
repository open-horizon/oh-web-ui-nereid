import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  server: {
    port: 8080,
    host: '0.0.0.0',
    proxy: {
      '^/api/': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    allowedHosts: ['hzn.t.yiqisoft.cn', 'hzn-dev.t.yiqisoft.cn'],
  },
})
