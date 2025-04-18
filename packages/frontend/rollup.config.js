import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';

// Determina se está em modo produção baseado na variável de ambiente ou flag do Rollup
const isProduction = !process.env.ROLLUP_WATCH;
// Diretório de saída: 'dist' para dev, '../backend/public' para prod
const outputDir = isProduction ? '../backend/public' : 'dist';
const useDevServer = process.env.SERVE === 'true' && !isProduction; // Ativar dev server apenas se SERVE=true

console.log(`--- Rollup ---`);
console.log(`Mode: ${isProduction ? 'Production' : 'Development'}`);
console.log(`Output Directory: ${outputDir}`);
if (!isProduction) console.log(`Live Reload: ${useDevServer ? 'Enabled (with Serve)' : 'Enabled (manual refresh needed if not using Serve)'}`);
console.log(`------------`);


export default {
  input: 'src/main.js',
  output: {
    file: `${outputDir}/bundle.js`,
    format: 'iife', // Immediately Invoked Function Expression - bom para browsers
    sourcemap: !isProduction, // Gera sourcemaps apenas em desenvolvimento
    name: 'VideoShareApp' // Nome global (opcional para iife)
  },
  plugins: [
    // Copia arquivos estáticos (HTML, assets) para o diretório de saída
    copy({
      targets: [
        { src: 'public/index.html', dest: outputDir },
        // Se tiver assets como SVGs ou imagens na pasta public/assets:
        // { src: 'public/assets/**/*', dest: `${outputDir}/assets` }
      ],
      // Limpa o diretório de destino antes de copiar (cuidado em produção!)
      // copyOnce: true, // Copia apenas na primeira vez (bom para watch)
      // verbose: true // Mostra quais arquivos foram copiados
    }),

    // Resolve dependências do node_modules
    resolve({ browser: true }), // browser: true para priorizar builds de navegador

    // Converte módulos CommonJS para ES6
    commonjs(),

    // Processa CSS: extrai para um arquivo separado e minimiza em produção
    postcss({
      extract: 'bundle.css', // Nome do arquivo CSS de saída
      minimize: isProduction, // Minimiza CSS em produção
      sourceMap: !isProduction ? 'inline' : false, // Sourcemap inline para CSS em dev
    }),

    // Plugins de Desenvolvimento (somente se não for produção)
    // Servidor de desenvolvimento (opcional, útil para testar frontend isoladamente)
    useDevServer && serve({
      contentBase: [outputDir], // Serve a partir do diretório de saída
      host: 'localhost',
      port: 8080,
      // historyApiFallback: true, // Se for uma SPA com roteamento
      // Abre o navegador automaticamente
      // open: true,
      // headers: { 'Access-Control-Allow-Origin': '*' } // Se precisar de CORS
    }),

    // Live Reload (atualiza o navegador automaticamente em mudanças)
    !isProduction && livereload(outputDir), // Monitora o diretório de saída

    // Plugin de Produção (somente se for produção)
    // Minimiza o código JavaScript
    isProduction && terser()
  ],
  // Habilita o modo "watch" do Rollup quando não está em produção
  watch: {
    clearScreen: false // Não limpa o console a cada rebuild
  }
};
