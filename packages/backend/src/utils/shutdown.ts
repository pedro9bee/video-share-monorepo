import { Server } from 'http';
import { CloudflareService } from '../services/cloudflare.service';
import { StatsService } from '../services/stats.service';
import { logInfo, logDebug, logError } from './logger';

let isShuttingDown = false;

export const registerGracefulShutdown = (serverInstance: Server | null): void => {

  // --- Aceita string ou Signal ---
  const handleShutdown = async (signal: NodeJS.Signals | string) => {
    if (isShuttingDown) {
      logDebug(`Encerramento já em progresso (recebido ${signal})...`);
      return;
    }
    isShuttingDown = true;
    logInfo(`\n👋 Recebido evento/sinal ${signal}. Iniciando encerramento gracioso...`);

    // ... (resto da função igual) ...
    logInfo('💾 Salvando estatísticas finais...');
    StatsService.saveStats();

    logInfo('🔪 Encerrando túnel Cloudflare...');
    try {
        await CloudflareService.stopTunnel('SIGTERM', 3000);
        logInfo('✅ Túnel Cloudflare encerrado ou timeout atingido.');
    } catch (tunnelError) { /* ... */ }

    if (serverInstance) {
        logInfo('🚪 Fechando servidor HTTP...');
        serverInstance.close((err) => { /* ... */ });
        setTimeout(() => { /* ... timeout ... */ }, 5000);
    } else { /* ... */ }
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

   process.on('uncaughtException', (error) => {
        logError('--- ERRO NÃO CAPTURADO ---');
        logError(error.stack || error.message);
        logError('--------------------------');
        // --- Chama handleShutdown com a string ---
        if (!isShuttingDown) {
            handleShutdown('uncaughtException');
        }
        setTimeout(() => process.exit(1), 8000);
   });

   process.on('unhandledRejection', (reason, promise) => {
        logError('--- REJEIÇÃO DE PROMISE NÃO TRATADA ---');
        logError('Razão:', reason);
        logError('--------------------------------------');
        // process.exit(1); // Sair diretamente pode ser mais seguro aqui
   });
};