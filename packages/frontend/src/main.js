// packages/frontend/src/main.js
import './styles.css';

console.log('[Frontend] Script inicializado.');

// --- CONSTANTES ---
// Define a URL do backend baseado em desenvolvimento ou produção
// Em desenvolvimento, frontend está em 8080, backend em 3000
// Em produção, frontend e backend são servidos da mesma origem
// Usando uma verificação simples (ROLLUP_WATCH é definido por rollup -w)
const IS_DEV = process.env.ROLLUP_WATCH;
const BACKEND_URL = IS_DEV ? 'http://localhost:3000' : ''; // Assume mesma origem em produção
console.log(`[Frontend] Modo: ${IS_DEV ? 'Desenvolvimento' : 'Produção'}. URL do Backend: '${BACKEND_URL || window.location.origin}'`);

// --- Seletores DOM ---
const videoPlayer = document.getElementById('videoPlayer');
const errorMessage = document.getElementById('errorMessage');

// --- Estado do Tracking ---
let sessionId = null;
let startTime = null;
let watchDuration = 0;
let isPlaying = false;
let heartbeatInterval = null;
let viewStarted = false;

// --- Funções Auxiliares ---

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

async function sendTrackingData(endpoint, data) {
    if (!sessionId) {
        console.warn("[Tracking] Session ID não gerado ainda.");
        return;
    }
    // Usa a URL absoluta do backend
    const url = `${BACKEND_URL}/track/${endpoint}`; // <-- Usa URL absoluta
    console.log(`[Tracking] Enviando para: ${url}`); // Log da URL sendo atingida
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...data }),
            keepalive: endpoint === 'exit' // Importante para 'exit'
        });
        if (!response.ok) {
            console.error(`[Tracking] Erro ao enviar para ${endpoint}: ${response.status} ${response.statusText}`);
            // Poderia tentar parsear response.text() para ver se o backend enviou uma mensagem de erro
        } else {
            console.log(`[Tracking] Evento '${endpoint}' enviado.`);
        }
    } catch (error) {
        console.error(`[Tracking] Falha na requisição para ${endpoint} (${url}):`, error);
    }
}

// --- Lógica de Tracking ---

function startTrackingSession() {
    if (viewStarted) return; // Já iniciado
    sessionId = generateSessionId();
    viewStarted = true;
    console.log(`[Tracking] Iniciando sessão: ${sessionId}`);
    sendTrackingData('start', {
        userAgent: navigator.userAgent,
        language: navigator.language,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString()
    });
}

function startHeartbeat() {
    clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (isPlaying && videoPlayer.duration > 0) {
            const currentPlayDuration = (new Date() - startTime) / 1000;
            sendTrackingData('heartbeat', {
                duration: watchDuration + currentPlayDuration,
                progress: videoPlayer.currentTime / videoPlayer.duration
            });
        } else if (!isPlaying) {
            clearInterval(heartbeatInterval);
        }
    }, 30000); // A cada 30 segundos
}

function updateWatchDuration() {
    if (isPlaying && startTime) {
        const segmentDuration = (new Date() - startTime) / 1000;
        watchDuration += segmentDuration;
        startTime = new Date();
        console.log(`[Tracking] Duração acumulada: ${watchDuration.toFixed(2)}s`);
    }
}

// --- Event Listeners do Vídeo ---

if (videoPlayer) { // Garante que videoPlayer existe
    videoPlayer.addEventListener('error', () => {
        const error = videoPlayer.error;
        console.error('[Player] Erro:', error);
        errorMessage.textContent = `Erro ao carregar vídeo: ${error ? error.message : 'desconhecido'} (Code: ${error?.code})`;
        errorMessage.style.display = 'block';
        if (viewStarted) {
            sendTrackingData('error', {
                errorCode: error ? error.code : 'unknown',
                errorMessage: error ? error.message : 'Erro desconhecido'
            });
        }
    });

    videoPlayer.addEventListener('play', () => {
        console.log('[Player] Play');
        if (!viewStarted) {
            startTrackingSession();
        }
        isPlaying = true;
        startTime = new Date();
        errorMessage.style.display = 'none';
        startHeartbeat();
    });

    videoPlayer.addEventListener('playing', () => {
        console.log('[Player] Playing (após buffer/seek)');
        if (!isPlaying) {
            isPlaying = true;
            startTime = new Date();
            if (!viewStarted) startTrackingSession();
            startHeartbeat();
        }
    });


    videoPlayer.addEventListener('pause', () => {
        console.log('[Player] Pause');
        if (!viewStarted) return;
        updateWatchDuration();
        isPlaying = false;
        clearInterval(heartbeatInterval);
        if (videoPlayer.duration > 0) {
             sendTrackingData('pause', {
                duration: watchDuration,
                progress: videoPlayer.currentTime / videoPlayer.duration
             });
        }
    });

    videoPlayer.addEventListener('ended', () => {
        console.log('[Player] Ended');
        if (!viewStarted) return;
        updateWatchDuration();
        isPlaying = false;
        clearInterval(heartbeatInterval);
        sendTrackingData('complete', {
            duration: watchDuration,
            completed: true
        });
    });

    videoPlayer.addEventListener('seeked', () => {
        console.log(`[Player] Seeked to ${videoPlayer.currentTime.toFixed(2)}s`);
        if (!viewStarted) return;
        if (isPlaying) {
            startTime = new Date();
        }
    });

    // --- Tracking de Saída da Página ---
    window.addEventListener('beforeunload', () => {
        console.log('[Tracking] Usuário saindo da página...');
        if (!viewStarted) return;
        updateWatchDuration();
        clearInterval(heartbeatInterval);

        if (navigator.sendBeacon) {
             const data = JSON.stringify({
                sessionId,
                duration: watchDuration,
                progress: (videoPlayer && videoPlayer.duration > 0) ? videoPlayer.currentTime / videoPlayer.duration : 0
             });
             const exitUrl = `${BACKEND_URL}/track/exit`; // <-- Usa URL absoluta
             try {
               const sent = navigator.sendBeacon(exitUrl, new Blob([data], { type: 'application/json' }));
               console.log(`[Tracking] sendBeacon para 'exit' (${exitUrl}) ${sent ? 'enfileirado' : 'falhou'}.`);
             } catch (e) {
                 console.error("[Tracking] Erro ao usar sendBeacon:", e);
                 // Fallback para fetch síncrono (menos confiável)
                 sendTrackingData('exit', { duration: watchDuration, progress: videoPlayer.currentTime / videoPlayer.duration });
             }
        } else {
            // Fallback para fetch (menos confiável no unload)
            sendTrackingData('exit', { duration: watchDuration, progress: videoPlayer.currentTime / videoPlayer.duration });
        }
    });

    // --- Definir origem do vídeo usando URL absoluta ---
    const videoSourceElement = videoPlayer.querySelector('source');
    if (videoSourceElement) {
        const videoUrl = `${BACKEND_URL}/video`; // <-- Usa URL absoluta para o vídeo
        videoSourceElement.src = videoUrl;
        videoPlayer.load(); // Recarrega a origem do vídeo
        console.log(`[Frontend] Origem do vídeo definida para: ${videoUrl}`);
    } else {
         console.error('[Frontend] Elemento <source> não encontrado dentro do <video>.');
    }

} else {
     console.error('[Frontend] Elemento <video> não encontrado.');
}

// --- Inicialização ---
console.log('[Frontend] Event listeners configurados.');