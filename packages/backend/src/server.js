#!/usr/bin/env node

// Carregar variáveis de ambiente do .env
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const QRCode = require('qrcode-terminal');
const mime = require('mime-types');

// --- Configuração ---
const isDevelopment = process.env.NODE_ENV === 'development';
const DEBUG = isDevelopment; // DEBUG é verdadeiro em desenvolvimento
const PORT = process.env.PORT || 3000;
const videoPath = process.env.VIDEO_PATH;
const customMessage = process.env.CUSTOM_MESSAGE || 'Feliz Páscoa! Assista a este vídeo especial!';

// Define o diretório do frontend baseado no ambiente
const frontendDistPath = isDevelopment
  ? path.resolve(__dirname, '../../frontend/dist') // DEV: Usa a pasta dist do frontend
  : path.resolve(__dirname, '../public');         // PROD: Usa a pasta public do backend

// Função de Log
const debugLog = (...args) => DEBUG && console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);

// Log Inicial
console.log(`[INFO] Modo: ${isDevelopment ? 'Desenvolvimento' : 'Produção'}`);
console.log(`[INFO] Servindo frontend de: ${frontendDistPath}`);

// --- Validação Inicial ---
if (!videoPath) {
  console.error('❌ Erro: Caminho do vídeo não definido. Defina a variável de ambiente VIDEO_PATH em packages/backend/.env');
  process.exit(1);
}
if (!fs.existsSync(videoPath)) {
  console.error(`❌ Erro: Arquivo de vídeo não encontrado em "${videoPath}"`);
  process.exit(1);
}
const mimeType = mime.lookup(videoPath);
if (!mimeType || !mimeType.startsWith('video/')) {
  console.error(`❌ Erro: Arquivo "${path.basename(videoPath)}" não parece ser um vídeo (${mimeType || 'tipo desconhecido'})`);
  process.exit(1);
}
debugLog('Configuração:', { videoPath: path.basename(videoPath), customMessage, port: PORT, frontendDist: frontendDistPath });

// --- Gerenciamento de Estatísticas ---
const statsDir = path.resolve(__dirname, '../stats');
if (!fs.existsSync(statsDir)) {
  fs.mkdirSync(statsDir, { recursive: true });
  debugLog('Criado diretório de estatísticas:', statsDir);
}
const statsFile = path.join(statsDir, 'access_stats.json');
let stats = {
  videoName: path.basename(videoPath),
  totalViews: 0,
  firstView: null,
  lastView: null,
  viewDuration: [], // Array de { sessionId, duration, completed, progress, timestamp, device }
  viewDetails: [],  // Array de { timestamp, ip, userAgent, referrer, id }
  activeSessions: {} // Armazenar sessões ativas { sessionId: { start, lastActive, userAgent, ... } }
};

// Carregar estatísticas existentes
if (fs.existsSync(statsFile)) {
  try {
    stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    stats.activeSessions = {}; // Limpar activeSessions ao iniciar
    debugLog('Estatísticas carregadas:', { totalViews: stats.totalViews });
  } catch (error) {
    debugLog('Erro ao carregar estatísticas, criando novo arquivo:', error);
    stats.activeSessions = {}; // Garantir que está limpo
  }
}

const saveStats = () => {
  try {
    const statsToSave = { ...stats, activeSessions: undefined }; // Não salvar activeSessions
    fs.writeFileSync(statsFile, JSON.stringify(statsToSave, null, 2));
    debugLog('Estatísticas salvas');
  } catch (error) {
    console.error("Erro ao salvar estatísticas:", error);
  }
};

// --- Servidor Express ---
const app = express();
app.use(express.json()); // Para endpoints de tracking

// Middleware para logar requisições (opcional)
app.use((req, res, next) => {
  debugLog(`Request: ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// ******** ROTA '/' DEFINIDA PRIMEIRO ********
// Rota principal - Servir o index.html modificado
app.get('/', (req, res, next) => {
  // Lógica de stats
  const timestamp = new Date();
  if (!stats.firstView) stats.firstView = timestamp.toISOString();
  stats.lastView = timestamp.toISOString();
  stats.totalViews++;
  const viewInfo = {
    timestamp: timestamp.toISOString(),
    ip: req.ip,
    userAgent: req.headers['user-agent'] || 'N/A',
    referrer: req.headers.referer || 'direct',
    id: `view_${Date.now()}_${Math.random().toString(36).substring(7)}`
  };
  stats.viewDetails.push(viewInfo);
  saveStats();
  console.log(`\n🎉 Nova visita #${stats.totalViews} de ${req.ip}`);
  // Fim da lógica de stats

  const indexPath = path.join(frontendDistPath, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      debugLog('Erro ao ler index.html:', err);
      if (err.code === 'ENOENT') {
         const errorMsg = isDevelopment
           ? "Erro: Arquivo 'index.html' não encontrado em 'packages/frontend/dist'. O Rollup (npm run dev) está rodando?"
           : "Erro: Arquivo 'index.html' não encontrado em 'packages/backend/public'. Execute 'npm run build' primeiro.";
         return res.status(500).send(errorMsg);
      }
      return res.status(500).send('Erro interno ao carregar a página.');
    }
    // Injetar dados dinâmicos
    try {
      const modifiedHtml = htmlData
        .replace('__CUSTOM_MESSAGE__', customMessage)
        .replace('__VIDEO_MIME_TYPE__', mimeType);
      res.send(modifiedHtml);
    } catch (replaceError) {
       debugLog("Erro ao substituir placeholders no HTML:", replaceError);
       res.status(500).send("Erro ao processar a página.");
    }
  });
}); // Fim de app.get('/')


// ******** MIDDLEWARE ESTÁTICO DEPOIS DA ROTA '/' ********
// Servir os arquivos estáticos do frontend (JS, CSS, etc.)
if (!fs.existsSync(frontendDistPath)) {
    console.error(`❌ Erro: Diretório do frontend (${frontendDistPath}) não encontrado.`);
    console.error(isDevelopment
        ? "   Execute 'npm run dev' na raiz (que roda o Rollup em watch)."
        : "   Execute 'npm run build' na raiz para criar os arquivos de produção."
    );
} else {
   // Este middleware agora só será usado para arquivos não tratados pela rota '/' acima
   app.use(express.static(frontendDistPath));
}


// Rota para servir o vídeo
app.get('/video', (req, res) => {
  debugLog('Requisição de vídeo recebida', { ip: req.ip, range: req.headers.range });
  try {
    // Verificar se videoPath é válido antes de statSync
    if (!fs.existsSync(videoPath)) {
        debugLog(`Erro crítico: VIDEO_PATH (${videoPath}) não existe mais.`);
        return res.status(404).send("Arquivo de vídeo não encontrado no servidor.");
    }
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start < 0 || start > end) {
          res.status(416).send('Range Not Satisfiable');
          return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
        };
        res.writeHead(206, head); // Partial Content
        file.pipe(res);
        file.on('error', (streamErr) => {
            debugLog("Erro no stream parcial do vídeo:", streamErr);
            if (!res.writableEnded) {
                res.end(); // Tenta finalizar a resposta
            }
        });
    } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
        };
        res.writeHead(200, head); // OK
        const file = fs.createReadStream(videoPath);
        file.pipe(res);
        file.on('error', (streamErr) => {
            debugLog("Erro no stream completo do vídeo:", streamErr);
             if (!res.writableEnded) {
                res.end();
            }
        });
    }
  } catch (statError) {
      debugLog("Erro ao obter stat do vídeo ou iniciar stream:", statError);
      res.status(500).send("Erro ao processar o arquivo de vídeo.");
  }
});

// --- Endpoints de Tracking ---
app.post('/track/start', (req, res) => {
  const { sessionId, userAgent, language, screenSize, timestamp } = req.body;
  if (!sessionId) return res.status(400).send('Missing sessionId');

  stats.activeSessions[sessionId] = {
    start: new Date(timestamp || Date.now()), // Usa timestamp do cliente ou atual
    lastActive: new Date(),
    userAgent: userAgent || 'N/A',
    language: language || 'N/A',
    screenSize: screenSize || 'N/A',
    ip: req.ip,
    duration: 0,
    progress: 0,
    completed: false
  };
  console.log(`\n▶️ Visualização iniciada: ${sessionId.substring(0, 8)}... (${req.ip})`);
  debugLog('Sessão iniciada:', stats.activeSessions[sessionId]);
  res.sendStatus(200);
});

app.post('/track/heartbeat', (req, res) => {
  const { sessionId, duration, progress } = req.body;
  if (!sessionId || !stats.activeSessions[sessionId]) return res.status(404).send('Session not found or ended');

  stats.activeSessions[sessionId].lastActive = new Date();
  stats.activeSessions[sessionId].duration = duration || 0;
  stats.activeSessions[sessionId].progress = progress || 0;
  debugLog(`Heartbeat: ${sessionId.substring(0, 8)}... Progresso: ${Math.round((progress || 0) * 100)}%`);
  res.sendStatus(200);
});

app.post('/track/pause', (req, res) => {
   const { sessionId, duration, progress } = req.body;
   if (!sessionId || !stats.activeSessions[sessionId]) return res.status(404).send('Session not found or ended');

   stats.activeSessions[sessionId].lastActive = new Date();
   stats.activeSessions[sessionId].duration = duration || 0;
   stats.activeSessions[sessionId].progress = progress || 0;
   debugLog(`Pausado: ${sessionId.substring(0, 8)}... Progresso: ${Math.round((progress || 0) * 100)}%`);
   res.sendStatus(200);
});

// Função auxiliar para finalizar e registrar uma sessão
function finalizeSession(sessionId, finalDuration, finalProgress, isCompleted) {
  if (!stats.activeSessions[sessionId]) {
    debugLog(`Tentativa de finalizar sessão já encerrada ou inválida: ${sessionId}`);
    return; // Sessão já finalizada ou inválida
  }

  const session = stats.activeSessions[sessionId];
  const finalProg = Math.min(Math.max(finalProgress || 0, 0), 1); // Garante progresso entre 0 e 1
  const finalDur = Math.max(finalDuration || 0, 0); // Garante duração não negativa

  stats.viewDuration.push({
    sessionId,
    duration: finalDur,
    progress: finalProg,
    completed: isCompleted || finalProg >= 0.95, // Considera completo se > 95%
    timestamp: new Date().toISOString(),
    device: session.userAgent,
    ip: session.ip
  });
  saveStats(); // Salva após registrar duração

  const status = isCompleted ? '✅ Completado' : '👋 Saiu';
  console.log(`\n${status}: ${sessionId.substring(0, 8)}...`);
  console.log(`   ⏱️ Duração: ${Math.round(finalDur)}s`);
  console.log(`   📊 Progresso: ${Math.round(finalProg * 100)}%`);

  delete stats.activeSessions[sessionId]; // Remove da memória ativa
}

app.post('/track/complete', (req, res) => {
  const { sessionId, duration } = req.body;
  if (!sessionId) return res.status(400).send('Missing sessionId');
  finalizeSession(sessionId, duration, 1.0, true); // Progresso 100%
  res.sendStatus(200);
});

app.post('/track/exit', (req, res) => {
   try {
      const { sessionId, duration, progress } = req.body;
      if (!sessionId) {
          debugLog("Recebido track/exit sem sessionId. Body:", req.body);
          return res.status(400).send('Missing sessionId');
      }
      finalizeSession(sessionId, duration, progress, false);
      res.sendStatus(200);
   } catch (e) {
      debugLog("Erro ao processar track/exit:", e, "Body:", req.body);
      res.status(400).send("Invalid request body");
   }
});

app.post('/track/error', (req, res) => {
  const { sessionId, errorCode, errorMessage } = req.body;
  console.error(`\n‼️ Erro no Player (Sessão: ${sessionId ? sessionId.substring(0,8) : 'N/A'}...): Code ${errorCode || 'N/A'}, ${errorMessage || 'N/A'}`);
  debugLog('Detalhes do erro do player:', req.body);
  res.sendStatus(200);
});

// Endpoint de Estatísticas
app.get('/stats', (req, res) => {
  // Retorna uma cópia segura sem as sessões ativas detalhadas
  res.json({
    videoName: stats.videoName,
    totalViews: stats.totalViews,
    firstView: stats.firstView,
    lastView: stats.lastView,
    viewDurationsCount: stats.viewDuration.length,
    viewDetailsCount: stats.viewDetails.length,
    activeSessionsCount: Object.keys(stats.activeSessions).length,
    // Opcional: Adicionar média de duração, etc.
    // averageDuration: stats.viewDuration.length > 0 ? stats.viewDuration.reduce((sum, vd) => sum + vd.duration, 0) / stats.viewDuration.length : 0
  });
});

// --- Inicialização e Cloudflared ---
let serverInstance = null;
let cloudflaredProcess = null;
let publicUrl = null;
let isShuttingDown = false; // Flag de encerramento

function startServerAndTunnel() {
    serverInstance = app.listen(PORT, () => {
        console.log(`\n🚀 Servidor Backend iniciado em http://localhost:${PORT}`);
        console.log(`📹 Compartilhando: ${path.basename(videoPath)}`);
        console.log(`[INFO] Servindo frontend de: ${frontendDistPath}`);
        startCloudflaredTunnel(); // Inicia o túnel após o servidor estar ouvindo
    });

    serverInstance.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Erro: Porta ${PORT} já está em uso.`);
        } else {
            console.error("❌ Erro ao iniciar servidor:", error);
        }
        if (cloudflaredProcess) cloudflaredProcess.kill(); // Tenta matar cloudflared se o server falhar
        process.exit(1);
    });
}


function startCloudflaredTunnel() {
  console.log('\n⏳ Iniciando túnel Cloudflare...');
  try {
    const cloudflaredCmd = 'cloudflared';
    const tunnelArgs = ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];
    cloudflaredProcess = spawn(cloudflaredCmd, tunnelArgs, { stdio: ['ignore', 'pipe', 'pipe'] }); // Ignora stdin, captura stdout/stderr

    const urlRegex = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/;

    // Função para processar a saída e encontrar a URL
    const processOutput = (data) => {
      const output = data.toString();
      const match = output.match(urlRegex);
      if (match && !publicUrl) {
        publicUrl = match[0];
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TÚNEL PRONTO!');
        console.log(`🔗 URL Pública: >>> ${publicUrl} <<<`);
        console.log("   (Use esta URL para compartilhar)");
        QRCode.generate(publicUrl, { small: true }, (qr) => console.log("\n📱 QR Code:\n" + qr));
        console.log(`\n📊 Stats: ${publicUrl}/stats`);
        console.log('\n⚠️ O link funciona SOMENTE enquanto este script estiver rodando.');
        console.log('   Pressione Ctrl+C aqui para encerrar.');
        console.log('='.repeat(60) + '\n');
      }
      return output.trim(); // Retorna a saída para log
    };

    cloudflaredProcess.stdout.on('data', (data) => {
        const output = processOutput(data);
        if (output) debugLog('[cloudflared stdout]:', output);
    });

    cloudflaredProcess.stderr.on('data', (data) => {
        const output = processOutput(data);
        // Loga stderr que não seja a URL já encontrada ou mensagens comuns de info/aviso
        if (output && !output.includes(publicUrl || '___NEVER_MATCH___')) {
             if (output.includes('ERR') || output.includes('error') || output.includes('failed') || output.includes('warn') || output.includes('level=warning')) {
                 console.warn(`\n⚠️ [cloudflared WARN/ERR]: ${output}`); // Usa console.warn para avisos/erros não críticos
             } else if (!output.includes('INF')) { // Evita logar mensagens INF aqui se já logou URL
                 debugLog('[cloudflared stderr]:', output);
             }
        }
    });

    cloudflaredProcess.on('close', (code) => {
      debugLog(`Processo cloudflared encerrado com código ${code}`);
      if (!isShuttingDown && code !== null && code !== 0) { // Se não estiver encerrando e fechou com erro
        console.error(`❌ Túnel Cloudflare encerrado inesperadamente (código ${code}).`);
        publicUrl = null; // Reseta URL se o túnel caiu
        // Opcional: tentar reiniciar o túnel?
      }
      cloudflaredProcess = null; // Limpa a referência
    });

    cloudflaredProcess.on('error', (err) => {
       console.error(`❌ Erro fatal ao executar o comando 'cloudflared': ${err.message}`);
       if (err.code === 'ENOENT') {
           console.error("   Certifique-se de que 'cloudflared' está instalado e no PATH do sistema.");
       }
       if (serverInstance) serverInstance.close(() => process.exit(1)); // Tenta fechar o servidor se cloudflared falhou ao iniciar
       else process.exit(1);
    });

  } catch (error) {
    console.error('\n❌ Falha crítica ao tentar iniciar cloudflared:', error);
    if (serverInstance) serverInstance.close(() => process.exit(1));
    else process.exit(1);
  }
}

// --- Encerramento Gracioso ---
function gracefulShutdown() {
  if (isShuttingDown) {
    debugLog('Encerramento já em progresso...');
    return;
  }
  isShuttingDown = true;
  console.log('\n👋 Encerrando...');
  saveStats();

  let cloudflaredExited = !cloudflaredProcess;
  let serverClosed = !serverInstance;

  const attemptExit = () => {
      if (cloudflaredExited && serverClosed) {
          console.log('✅ Tudo encerrado. Saindo.');
          process.exit(0);
      }
  }

  // 1. Tentar encerrar Cloudflared
  if (cloudflaredProcess) {
    console.log('🔪 Encerrando túnel Cloudflare...');
    // Ouvinte para saber quando realmente saiu
    cloudflaredProcess.on('exit', (code) => {
        debugLog(`Cloudflared saiu com código ${code}.`);
        cloudflaredExited = true;
        attemptExit(); // Tenta sair se o servidor já fechou
    });
    cloudflaredProcess.kill('SIGTERM'); // Envia SIGTERM

    // Timeout para forçar SIGKILL se SIGTERM não funcionar
    setTimeout(() => {
        if (!cloudflaredExited && cloudflaredProcess) {
            debugLog('Timeout SIGTERM cloudflared, enviando SIGKILL.');
            cloudflaredProcess.kill('SIGKILL');
            // Assume que saiu após SIGKILL para fins de lógica de saída
            // (pode não ser 100% garantido, mas evita travamento)
            cloudflaredExited = true;
            attemptExit();
        }
    }, 3000); // 3 segundos para SIGTERM

  } else {
      debugLog('Processo Cloudflared não estava ativo.');
  }

  // 2. Tentar fechar o servidor Express
  if (serverInstance) {
      console.log('🚪 Fechando servidor Express...');
      serverInstance.close((err) => {
          if (err) {
              console.error("❌ Erro ao fechar o servidor Express:", err);
              // Mesmo com erro aqui, tentamos sair, mas com código de erro
              serverClosed = true; // Marca como 'tentou fechar'
              if (cloudflaredExited) process.exit(1); // Sai se cloudflare já terminou
          } else {
              console.log('✅ Servidor Backend encerrado.');
              serverClosed = true;
              attemptExit(); // Tenta sair se cloudflare já terminou
          }
      });

      // Timeout para o fechamento do servidor
      setTimeout(() => {
          if (!serverClosed) {
              console.error("❌ Timeout ao fechar servidor Express (conexões presas?). Forçando saída.");
              process.exit(1); // Força saída com erro
          }
      }, 5000); // 5 segundos para fechar o servidor (após SIGTERM no cloudflare)

  } else {
       debugLog('Instância do servidor não estava ativa.');
  }

  // Segurança extra: Timeout geral para garantir que o processo saia
  setTimeout(() => {
      if (!cloudflaredExited || !serverClosed) {
        console.error("❌ Timeout geral de encerramento. Forçando saída.");
        process.exit(1);
      }
  }, 8000); // 8 segundos no total
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// --- Iniciar ---
startServerAndTunnel();