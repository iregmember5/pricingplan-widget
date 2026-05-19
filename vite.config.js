// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   build: {
//     lib: {
//       entry: 'src/main.tsx',
//       name: 'PricingWidget',
//       fileName: 'widget',
//     },
//     rollupOptions: {
//       output: {
//         globals: {
//           react: 'React',
//           'react-dom': 'ReactDOM',
//         },
//       },
//     },
//   },
// });



import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // ← VERY IMPORTANT
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html', // ← THIS IS THE KEY
    },
    
  },
})