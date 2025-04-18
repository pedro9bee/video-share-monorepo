import { spawn, ChildProcess } from 'child_process'; // Importa ChildProcess genérico
import { logDebug, logError, logInfo, logWarn } from '../utils/logger';
import qrcode from 'qrcode-terminal';
import EventEmitter from 'events';

// Usar tipo mais genérico ou manter ChildProcessWithoutNullStreams e ajustar spawn?
// Vamos com ChildProcess por simplicidade inicial.
let cloudflaredProcess: ChildProcess | null = null;
let publicUrl: string | null = null;
let lastKnownError: string | null = null;

class CloudflareEmitter extends EventEmitter {}
const tunnelEmitter = new CloudflareEmitter();

const startTunnel = (port: number): void => {
  if (cloudflaredProcess) {
    logWarn('Túnel Cloudflare já está em execução ou sendo iniciado.');
    return;
  }

  logInfo('\n⏳ Iniciando túnel Cloudflare...');
  publicUrl = null;
  lastKnownError = null;

  try {
    const cloudflaredCmd = 'cloudflared';
    const tunnelArgs = ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'];
    // A tipagem aqui pode precisar de ajuste dependendo da versão do @types/node
    // Mas vamos usar ChildProcess por enquanto.
    cloudflaredProcess = spawn(cloudflaredCmd, tunnelArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    const urlRegex = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/;

    const processOutput = (data: Buffer | string): string => {
        const output = data.toString().trim();
        const match = output.match(urlRegex);

        if (match && !publicUrl) {
            publicUrl = match[0];
            logInfo('\n' + '='.repeat(60));
            logInfo('🎉 TÚNEL PRONTO!');
            logInfo(`🔗 URL Pública: >>> ${publicUrl} <<<`);
            logInfo("   (Use esta URL para compartilhar)");
            qrcode.generate(publicUrl, { small: true }, (qr) => logInfo("\n📱 QR Code:\n" + qr));
            logInfo(`\n📊 Stats: ${publicUrl}/stats`);
            logInfo('\n⚠️ O link funciona SOMENTE enquanto este script estiver rodando.');
            logInfo('   Pressione Ctrl+C aqui para encerrar.');
            logInfo('='.repeat(60) + '\n');
            tunnelEmitter.emit('ready', publicUrl);
        }
        return output;
    };

    // --- Adicionar verificações antes de usar cloudflaredProcess ---
    if (cloudflaredProcess) {
        cloudflaredProcess.stdout?.on('data', (data) => {
            const output = processOutput(data);
            if (output) logDebug('[cloudflared stdout]:', output);
        });

        cloudflaredProcess.stderr?.on('data', (data) => {
            const output = processOutput(data);
            if (output && !output.includes(publicUrl || '___NEVER_MATCH___')) {
                lastKnownError = output;
                if (output.includes('ERR') || output.includes('error') || output.includes('failed') || output.includes('warn') || output.includes('level=warning')) {
                    logWarn(`[cloudflared WARN/ERR]: ${output}`);
                } else if (!output.includes('INF')) {
                    logDebug('[cloudflared stderr]:', output);
                }
            }
        });

        cloudflaredProcess.on('close', (code) => {
            logDebug(`Processo cloudflared encerrado com código ${code}`);
            const wasRunning = !!publicUrl;
            publicUrl = null;
            cloudflaredProcess = null; // Limpa referência *antes* de emitir evento

            if (code !== null && code !== 0) {
                const message = `Túnel Cloudflare ${wasRunning ? 'encerrado inesperadamente' : 'falhou ao iniciar'} (código ${code}). ${lastKnownError || ''}`.trim();
                logError(message);
                tunnelEmitter.emit('error', new Error(message));
            } else {
                logInfo('Túnel Cloudflare encerrado normalmente.');
                tunnelEmitter.emit('close');
            }
        });

        cloudflaredProcess.on('error', (err) => {
            logError(`Erro fatal ao executar o comando 'cloudflared': ${err.message}`);
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                logError("   Certifique-se de que 'cloudflared' está instalado e no PATH do sistema.");
            }
            publicUrl = null;
            cloudflaredProcess = null; // Limpa referência
            tunnelEmitter.emit('error', err);
        });
    } else {
         // Se cloudflaredProcess for null após spawn (improvável, mas seguro)
         const spawnError = new Error('Falha ao iniciar o processo cloudflared (spawn retornou null/undefined).');
         logError(spawnError.message);
         tunnelEmitter.emit('error', spawnError);
    }

  } catch (error) {
    logError('Falha crítica ao tentar iniciar cloudflared:', error);
    publicUrl = null;
    cloudflaredProcess = null;
    tunnelEmitter.emit('error', error instanceof Error ? error : new Error(String(error)));
  }
};

// stopTunnel e getPublicUrl permanecem iguais...
const stopTunnel = async (signal: NodeJS.Signals = 'SIGTERM', timeoutMs = 3000): Promise<void> => {
   // ... (código igual ao anterior, já lida com cloudflaredProcess sendo null) ...
    return new Promise((resolve) => {
        const currentProcess = cloudflaredProcess; // Captura referência atual
        if (!currentProcess) {
            logDebug('stopTunnel: Nenhum processo cloudflared ativo.');
            resolve();
            return;
        }

        logInfo('🔪 Encerrando túnel Cloudflare...');
        let exited = false;

        const exitListener = (code: number | null) => {
            logDebug(`Cloudflared saiu com código ${code}.`);
            exited = true;
            if (cloudflaredProcess === currentProcess) { // Garante que é o mesmo processo
               cloudflaredProcess = null;
               publicUrl = null;
            }
            resolve();
        };
        currentProcess.once('exit', exitListener);

        try {
            currentProcess.kill(signal);
        } catch (e) {
            logError(`Erro ao enviar ${signal} para cloudflared:`, (e as Error).message);
            currentProcess.removeListener('exit', exitListener);
             if (cloudflaredProcess === currentProcess) {
               cloudflaredProcess = null;
               publicUrl = null;
            }
            resolve();
            return;
        }

        if (signal === 'SIGTERM') {
            setTimeout(() => {
                if (!exited && cloudflaredProcess === currentProcess) {
                    logWarn(`Timeout ${signal} cloudflared, enviando SIGKILL.`);
                    try { currentProcess.kill('SIGKILL'); } catch (killErr) { /* ... */ }
                     if (cloudflaredProcess === currentProcess) {
                       cloudflaredProcess = null; publicUrl = null;
                     }
                     resolve();
                }
            }, timeoutMs);
        } else {
             setTimeout(() => {
                 if (!exited && cloudflaredProcess === currentProcess) {
                    logWarn('Processo não saiu mesmo após SIGKILL.');
                    cloudflaredProcess = null; publicUrl = null;
                 }
                 resolve();
             }, 500);
        }
    });
};

const getPublicUrl = (): string | null => {
    return publicUrl;
};


export const CloudflareService = {
    startTunnel,
    stopTunnel,
    getPublicUrl,
    emitter: tunnelEmitter,
};