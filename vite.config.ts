import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // The bundle gets its own folder so that dist/assets stays a clean copy of
    // public/assets — the artwork folder, and nothing else.
    assetsDir: 'bundle',
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
