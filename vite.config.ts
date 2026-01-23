import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      less: {
        additionalData: `@import "rsuite/styles/index.less";`
      }
    }
  },
  build: {
    outDir: 'dist-webui',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})