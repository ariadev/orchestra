import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/sessions': {
        target: 'http://localhost:7890',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:7890',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://localhost:7890',
        changeOrigin: true,
      },
    },
  },
})
