import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite'; // Correto
import path from 'path';
// import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'; // <-- REMOVIDO

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';
  const outputDir = isProduction ? '../backend/public/mfe/video-share' : 'dist';
  const base = isProduction ? '/mfe/video-share/' : '/';

  console.log(`--- Vite ---`);
  console.log(`Mode: ${mode}`);
  console.log(`Output Directory: ${outputDir}`);
  // ... outros logs ...
  console.log(`------------`);

  return {
    plugins: [
      preact(),
      // cssInjectedByJsPlugin(), // <-- REMOVIDO
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      // Garante que o CSS será gerado separadamente (geralmente o padrão)
      // cssCodeSplit: true, // O padrão já é true, não precisa setar explicitamente
      outDir: outputDir,
      sourcemap: !isProduction,
      lib: {
        entry: path.resolve(__dirname, 'src/main.tsx'),
        name: 'VideoShareMFE', // <-- NOME REQUERIDO PARA IIFE/UMD ADICIONADO DE VOLTA
        fileName: (format) => `video-share-mfe.${format === 'es' ? 'js' : format}`,
        formats: ['iife'],
      },
      emptyOutDir: true,
    },
    server: {
      port: 8080,
      open: '/dev.html',
      proxy: {
        '/video': {
          target: env.VITE_DEV_BACKEND_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
        '/track': {
          target: env.VITE_DEV_BACKEND_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    base: base,
  };
});