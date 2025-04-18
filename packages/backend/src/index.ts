// packages/backend/src/index.ts
import http from 'http';
import app from './app'; // Importa a instância configurada do Express
import config from './config';
import { StatsService } from './services/stats.service';
import { CloudflareService } from './services/cloudflare.service';
import { logInfo, logError, logDebug } from './utils/logger';
import { registerGracefulShutdown } from './utils/shutdown';
import path from 'path'; // Import path aqui, pois é usado

let serverInstance: http.Server | null = null;

const start = async () => {
  logInfo('Iniciando aplicação...');

  // Carregar estatísticas iniciais
  StatsService.loadStats();

  // Criar e iniciar o servidor HTTP
  serverInstance = http.createServer(app);

  serverInstance.listen(config.PORT, () => {
    logInfo(`\n🚀 Servidor Backend iniciado em http://localhost:${config.PORT}`);
    logInfo(`📹 Compartilhando: ${path.basename(config.VIDEO_PATH)}`); // Usa path.basename

    // Logar o diretório do frontend SOMENTE em produção
    if (config.IS_PROD) {
      logInfo(`[INFO] Servindo frontend (produção) de: ${config.FRONTEND_BUILD_PATH_PROD}`); // <--- NOME CORRETO AQUI
    } else {
       logInfo(`[INFO] Modo desenvolvimento: Frontend servido por Rollup em :8080`);
    }


    logInfo(''); // Linha em branco para espaçamento
    logInfo('⏳ Iniciando túnel Cloudflare...'); // Movido para depois dos logs iniciais

    // Iniciar Cloudflare Tunnel APÓS o servidor estar ouvindo
    CloudflareService.startTunnel(config.PORT);
  });

  // Registrar manipuladores de encerramento gracioso
  registerGracefulShutdown(serverInstance);

  // Lidar com erros do servidor (ex: porta já em uso)
  serverInstance.on('error', (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') throw error;
    switch (error.code) {
      case 'EACCES':
        logError(`❌ Erro: Porta ${config.PORT} requer privilégios elevados.`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        logError(`❌ Erro: Porta ${config.PORT} já está em uso.`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  // Opcional: Ouvir eventos do túnel
  CloudflareService.emitter.on('ready', (url: string) => {
    logInfo(`✅ Túnel Cloudflare pronto: ${url}`);
  });
  CloudflareService.emitter.on('error', (err: Error) => {
    logError(`❌ Erro no túnel Cloudflare: ${err.message}`);
    // process.exit(1); // Considerar sair em caso de erro no túnel
  });
   CloudflareService.emitter.on('close', () => {
    logInfo(`ℹ️ Túnel Cloudflare foi fechado.`);
  });
};

// Não precisa importar path novamente aqui, já foi importado acima

// Executar a função de inicialização
start().catch(error => {
    logError("Erro fatal durante a inicialização:", error);
    process.exit(1);
});