// packages/frontend/rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import replace from '@rollup/plugin-replace'; // <-- Importar replace
import { terser } from 'rollup-plugin-terser';

// ROLLUP_WATCH é setado para 'true' (string) pelo Rollup quando -w é usado
const isWatching = !!process.env.ROLLUP_WATCH;
const isProduction = !isWatching;

// Diretório de saída é 'dist' em dev, '../backend/public' em prod
const outputDir = isProduction ? '../backend/public' : 'dist';
const useDevServer = isWatching;

console.log(`--- Rollup ---`);
console.log(`Mode: ${isProduction ? 'Production' : 'Development (Watch)'}`);
console.log(`Output Directory: ${outputDir}`);
if (useDevServer) console.log(`Use Dev Server: ${useDevServer}`);
if (useDevServer) console.log(`Live Reload: Enabled (watching ${outputDir})`);
console.log(`------------`);


export default {
  input: 'src/main.js',
  output: {
    file: `${outputDir}/bundle.js`,
    format: 'iife',
    sourcemap: !isProduction,
    name: 'VideoShareApp'
  },
  plugins: [
    // 1. Substituir variáveis de ambiente ANTES de outros plugins
    replace({
      // Impede que outros plugins processem as variáveis antes da substituição
      preventAssignment: true,
      // Define as substituições. Usamos JSON.stringify para garantir
      // que booleanos sejam inseridos como literais 'true' ou 'false' no código.
      values: {
        'process.env.ROLLUP_WATCH': JSON.stringify(isWatching),
        // Você pode adicionar outras variáveis aqui se precisar
        // 'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      }
    }),

    // 2. Copia arquivos estáticos
    copy({
      targets: [
        { src: 'public/index.html', dest: outputDir },
        // { src: 'public/assets/**/*', dest: `${outputDir}/assets` }
      ],
      copyOnce: isProduction,
      verbose: true,
    }),

    // 3. Resolve dependências
    resolve({ browser: true }),

    // 4. Converte CommonJS
    commonjs(),

    // 5. Processa CSS
    postcss({
      extract: 'bundle.css',
      minimize: isProduction,
      sourceMap: !isProduction ? 'inline' : false,
    }),

    // 6. Plugins de Desenvolvimento
    useDevServer && serve({
      contentBase: outputDir,
      port: 8080,
      open: true,
      verbose: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    }),
    useDevServer && livereload({
        watch: outputDir,
        verbose: true
    }),

    // 7. Plugin de Produção
    isProduction && terser()
  ],
  watch: {
    clearScreen: false,
    include: ['src/**', 'public/**'],
    exclude: [`${outputDir}/**`]
  }
};