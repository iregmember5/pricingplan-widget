import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/main.tsx',
      name: 'FormWidget',
      fileName: () => 'widget-loader.js',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
        assetFileNames: (info) => {
          // Inline CSS into JS — rename to avoid separate file
          if (info.name?.endsWith('.css')) return 'widget-loader.css';
          return info.name || 'asset';
        },
      },
    },
    cssCodeSplit: false,
    minify: true,
  },
})
