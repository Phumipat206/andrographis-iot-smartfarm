import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/andrographis/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/andrographis/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/andrographis/, ''),
      },
      '/andrographis/ws': {
        target: 'ws://localhost:8001',
        ws: true,
        rewrite: (path) => path.replace(/^\/andrographis/, ''),
      },
    },
  },
})
