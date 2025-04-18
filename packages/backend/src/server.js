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
const DEBUG = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
const videoPath = process.env.VIDEO_PATH; // Obter via variável de ambiente
const customMessage = process.env.CUSTOM_MESSAGE || 'Feliz Páscoa! Assista a este vídeo especial!';
// Caminho para onde o frontend será buildado pelo Rollup (em produção)
const frontendDistPath = path.resolve(__dirname, '../public');

const debugLog = (...args) => DEBUG && console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);

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
    // Limpar activeSessions ao iniciar
    stats.activeSessions = {};
    debugLog('Estatísticas carregadas:', { totalViews: stats.totalViews });
  } catch (error) {
    debugLog('Erro ao carregar estatísticas, criando novo arquivo:', error);
    stats.activeSessions = {}; // Garantir que está limpo
  }
}

const saveStats = () => {
  try {
    // Não salvar activeSessions no arquivo
    const statsToSave = { ...stats, activeSessions: undefined };
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

// Servir os arquivos estáticos do frontend (construídos pelo Rollup)
// Certifique-se de que o frontend foi buildado para esta pasta!
if (!fs.existsSync(frontendDistPath)) {
    console.warn(`⚠️ Aviso: Diretório do frontend buildado (${frontendDistPath}) não encontrado. Execute 'npm run build' na raiz.`);
}
app.use(express.static(frontendDistPath));


// Rota principal - Servir o index.html modificado
app.get('/', (req, res, next) => {
  // Registrar acesso
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
  saveStats(); // Salva a cada visita à página principal

  console.log(`\n🎉 Nova visita #${stats.totalViews} de ${req.ip}`);

  // Ler o template index.html
  const indexPath = path.join(frontendDistPath, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      debugLog('Erro ao ler index.html:', err);
      // Se o arquivo não existir, talvez o frontend não foi buildado
      if (err.code === 'ENOENT') {
         return res.status(500).send("Erro: Arquivo 'index.html' do frontend não encontrado. Execute 'npm run build' primeiro.");
      }
      return res.status(500).send('Erro interno ao carregar a página.');
    }
    // Injetar dados dinâmicos (simples substituição)
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
});

// Rota para servir o vídeo
app.get('/video', (req, res) => {
  debugLog('Requisição de vídeo recebida', { ip: req.ip, range: req.headers.range });
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    // Handle range requests for the end of the file (e.g., "bytes=1000-")
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Ensure range is valid
    if (start >= fileSize || end >= fileSize || start > end) {
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
     file.on('error', (err) => {
        debugLog("Erro ao transmitir stream parcial:", err);
        res.status(500).end(); // Encerra a resposta em caso de erro de stream
    });
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
    };
    res.writeHead(200, head); // OK
    const file = fs.createReadStream(videoPath);
    file.pipe(res);
    file.on('error', (err) => {
        debugLog("Erro ao transmitir stream completo:", err);
        res.status(500).end();
    });
  }
});

// --- Endpoints de Tracking ---
app.post('/track/start', (req, res) => {
  const { sessionId, userAgent, language, screenSize, timestamp } = req.body;
  if (!sessionId) return res.status(400).send('Missing sessionId');

  stats.activeSessions[sessionId] = {
    start: new Date(timestamp),
    lastActive: new Date(),
    userAgent,
    language,
    screenSize,
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
  if (!sessionId || !stats.activeSessions[sessionId]) return res.sendStatus(404);

  stats.activeSessions[sessionId].lastActive = new Date();
  stats.activeSessions[sessionId].duration = duration;
  stats.activeSessions[sessionId].progress = progress;
  debugLog(`Heartbeat: ${sessionId.substring(0, 8)}... Progresso: ${Math.round(progress * 100)}%`);
  res.sendStatus(200);
});

app.post('/track/pause', (req, res) => {
   const { sessionId, duration, progress } = req.body;
   if (!sessionId || !stats.activeSessions[sessionId]) return res.sendStatus(404);

   stats.activeSessions[sessionId].lastActive = new Date();
   stats.activeSessions[sessionId].duration = duration;
   stats.activeSessions[sessionId].progress = progress;
   debugLog(`Pausado: ${sessionId.substring(0, 8)}... Progresso: ${Math.round(progress * 100)}%`);
   res.sendStatus(200);
});

// Função auxiliar para finalizar e registrar uma sessão
function finalizeSession(sessionId, finalDuration, finalProgress, isCompleted) {
  if (!stats.activeSessions[sessionId]) return; // Sessão já finalizada ou inválida

  const session = stats.activeSessions[sessionId];
  stats.viewDuration.push({
    sessionId,
    duration: finalDuration,
    progress: finalProgress,
    completed: isCompleted || finalProgress >= 0.95, // Considera completo se > 95%
    timestamp: new Date().toISOString(),
    device: session.userAgent,
    ip: session.ip // Registrar IP na estatística final também
  });
  saveStats(); // Salva após registrar duração

  const status = isCompleted ? '✅ Completado' : '👋 Saiu';
  console.log(`\n${status}: ${sessionId.substring(0, 8)}...`);
  console.log(`   ⏱️ Duração: ${Math.round(finalDuration)}s`);
  console.log(`   📊 Progresso: ${Math.round(finalProgress * 100)}%`);

  delete stats.activeSessions[sessionId]; // Remove da memória ativa
}

app.post('/track/complete', (req, res) => {
  const { sessionId, duration } = req.body;
  finalizeSession(sessionId, duration, 1.0, true); // Progresso 100%
  res.sendStatus(200);
});

app.post('/track/exit', (req, res) => {
  // sendBeacon envia como application/json, então o body deve ser tratado normalmente
   try {
      const { sessionId, duration, progress } = req.body;
      finalizeSession(sessionId, duration, progress, false);
      res.sendStatus(200);
   } catch (e) {
      debugLog("Erro ao processar track/exit:", e, "Body:", req.body);
      res.status(400).send("Invalid request body");
   }
});

app.post('/track/error', (req, res) => {
  const { sessionId, errorCode, errorMessage } = req.body;
  console.error(`\n‼️ Erro no Player (Sessão: ${sessionId ? sessionId.substring(0,8) : 'N/A'}...): Code ${errorCode}, ${errorMessage}`);
  debugLog('Detalhes do erro do player:', req.body);
  res.sendStatus(200);
});


// Endpoint de Estatísticas
app.get('/stats', (req, res) => {
  res.json({
    videoName: stats.videoName,
    totalViews: stats.totalViews,
    firstView: stats.firstView,
    lastView: stats.lastView,
    viewDurationsCount: stats.viewDuration.length,
    viewDetailsCount: stats.viewDetails.length,
    activeSessionsCount: Object.keys(stats.activeSessions).length,
    // Para evitar expor muitos dados, pode-se limitar o que é retornado
    // viewDurationSample: stats.viewDuration.slice(-5), // Últimas 5 durações
    // viewDetailsSample: stats.viewDetails.slice(-5) // Últimos 5 detalhes
  });
});

// --- Inicialização e Cloudflared ---
let serverInstance = null;
let cloudflaredProcess = null;

function startServerAndTunnel() {
    serverInstance = app.listen(PORT, () => {
        console.log(`\n🚀 Servidor Backend iniciado em http://localhost:${PORT}`);
        console.log(`📹 Compartilhando: ${path.basename(videoPath)}`);
        console.log(`Frontend servido de: ${frontendDistPath}`);
        startCloudflaredTunnel();
    });

    serverInstance.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Erro: Porta ${PORT} já está em uso.`);
        } else {
            console.error("❌ Erro ao iniciar servidor:", error);
        }
        process.exit(1);
    });
}


function startCloudflaredTunnel() {
  console.log('\n⏳ Iniciando túnel Cloudflare...');
  try {
    // Tentar encontrar cloudflared no PATH
    const cloudflaredCmd = 'cloudflared'; // Assumir que está no PATH
    const tunnelArgs = ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];

    cloudflaredProcess = spawn(cloudflaredCmd, tunnelArgs, { stdio: 'pipe' });
    let publicUrl = null;

    const urlRegex = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/;

    cloudflaredProcess.stdout.on('data', (data) => {
      const output = data.toString();
      debugLog('[cloudflared stdout]:', output.trim());
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
    });

    cloudflaredProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      // Filtrar mensagens comuns não críticas
      if (errorOutput.includes('failed to request quick Tunnel') || errorOutput.includes('connection reset by peer')) {
         debugLog('[cloudflared info/warn]:', errorOutput); // Logar como debug
      } else if (errorOutput.includes('ERR') || errorOutput.includes('error')) {
        console.error(`\n‼️ [cloudflared ERRO]: ${errorOutput}`);
      } else {
        debugLog('[cloudflared stderr]:', errorOutput);
      }
    });

    cloudflaredProcess.on('close', (code) => {
      debugLog(`Processo cloudflared encerrado com código ${code}`);
      if (code !== null && code !== 0 && !publicUrl) { // Se fechou com erro *antes* de obter URL
        console.error('❌ Falha ao iniciar o túnel Cloudflare. Verifique a saída de erro acima.');
        console.error('   Possíveis causas: conexão, firewall, versão do cloudflared.');
        // Tentar encerrar o servidor se o túnel falhou criticamente
        if (serverInstance) serverInstance.close();
      } else if (code !== null && code !== 0) {
        console.warn(`⚠️ Túnel Cloudflare encerrado inesperadamente (código ${code}). O link público não funciona mais.`);
      }
      cloudflaredProcess = null;
    });

    cloudflaredProcess.on('error', (err) => {
       console.error(`❌ Erro ao executar o comando 'cloudflared': ${err.message}`);
       if (err.code === 'ENOENT') {
           console.error("   Certifique-se de que 'cloudflared' está instalado e no PATH do sistema.");
       }
       if (serverInstance) serverInstance.close();
    });

  } catch (error) {
    console.error('\n❌ Falha crítica ao tentar iniciar cloudflared:', error);
    if (serverInstance) serverInstance.close();
  }
}

// --- Encerramento Gracioso ---
function gracefulShutdown() {
  console.log('\n👋 Encerrando...');
  saveStats(); // Salvar estatísticas finais

  const killTimeout = setTimeout(() => {
      debugLog('Timeout ao tentar encerrar cloudflared, forçando SIGKILL.');
      if (cloudflaredProcess) cloudflaredProcess.kill('SIGKILL');
  }, 3000); // 3 segundos de timeout para SIGTERM

  if (cloudflaredProcess) {
    console.log('🔪 Encerrando túnel Cloudflare...');
    cloudflaredProcess.kill('SIGTERM'); // Tentar terminar graciosamente
  }

  if (serverInstance) {
      serverInstance.close(() => {
          clearTimeout(killTimeout); // Cancela o timeout do kill se fechou a tempo
          console.log('✅ Servidor Backend encerrado.');
          process.exit(0);
      });
  } else {
      clearTimeout(killTimeout);
      process.exit(0); // Se o servidor não estava rodando
  }

  // Timeout final para garantir a saída
  setTimeout(() => {
      console.error("❌ Encerramento forçado após timeout.");
      process.exit(1);
  }, 6000); // 6 segundos total
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// --- Iniciar ---
startServerAndTunnel();

