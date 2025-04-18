// Importa o CSS principal para que o Rollup o processe
import './styles.css';

console.log('[Frontend] Script inicializado.');

// --- Seletores DOM ---
const videoPlayer = document.getElementById('videoPlayer');
const errorMessage = document.getElementById('errorMessage');

// --- Estado do Tracking ---
let sessionId = null; // Será gerado no primeiro evento
let startTime = null;
let watchDuration = 0;
let isPlaying = false;
let heartbeatInterval = null;
let viewStarted = false; // Flag para garantir que 'start' seja enviado apenas uma vez

// --- Funções Auxiliares ---

// Gera um ID único para a sessão
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

// Envia dados de tracking para o backend
async function sendTrackingData(endpoint, data) {
    if (!sessionId) {
        console.warn("[Tracking] Session ID não gerado ainda.");
        return; // Não envia se não tem session ID
    }
    const url = `/track/${endpoint}`; // URL relativa ao backend
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, ...data }),
            keepalive: endpoint === 'exit' // Importante para 'exit'
        });
        if (!response.ok) {
            console.error(`[Tracking] Erro ao enviar para ${endpoint}: ${response.status} ${response.statusText}`);
        } else {
            console.log(`[Tracking] Evento '${endpoint}' enviado.`);
        }
    } catch (error) {
        console.error(`[Tracking] Falha na requisição para ${endpoint}:`, error);
    }
}

// --- Lógica de Tracking ---

// Inicia a sessão e envia o evento 'start'
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

// Inicia o heartbeat para manter a sessão ativa
function startHeartbeat() {
    clearInterval(heartbeatInterval); // Limpa intervalo anterior
    heartbeatInterval = setInterval(() => {
        if (isPlaying && videoPlayer.duration > 0) {
            const currentPlayDuration = (new Date() - startTime) / 1000;
            sendTrackingData('heartbeat', {
                duration: watchDuration + currentPlayDuration,
                progress: videoPlayer.currentTime / videoPlayer.duration
            });
        } else if (!isPlaying) {
            // Se estiver pausado, parar o heartbeat
            clearInterval(heartbeatInterval);
        }
    }, 30000); // A cada 30 segundos
}

// Calcula e acumula a duração assistida
function updateWatchDuration() {
    if (isPlaying && startTime) {
        const segmentDuration = (new Date() - startTime) / 1000;
        watchDuration += segmentDuration;
        startTime = new Date(); // Reseta startTime para o próximo segmento
        console.log(`[Tracking] Duração acumulada: ${watchDuration.toFixed(2)}s`);
    }
}

// --- Event Listeners do Vídeo ---

videoPlayer.addEventListener('error', () => {
    const error = videoPlayer.error;
    console.error('[Player] Erro:', error);
    errorMessage.textContent = `Erro ao carregar vídeo: ${error ? error.message : 'desconhecido'} (Code: ${error?.code})`;
    errorMessage.style.display = 'block';
    if (viewStarted) { // Só envia erro se a sessão começou
        sendTrackingData('error', {
            errorCode: error ? error.code : 'unknown',
            errorMessage: error ? error.message : 'Erro desconhecido'
        });
    }
});

// Evento 'play' é disparado ao iniciar ou retomar
videoPlayer.addEventListener('play', () => {
    console.log('[Player] Play');
    if (!viewStarted) {
        startTrackingSession(); // Inicia a sessão no primeiro play
    }
    isPlaying = true;
    startTime = new Date(); // Marca o início do segmento de play
    errorMessage.style.display = 'none';
    startHeartbeat(); // Inicia ou reinicia o heartbeat
});

// Evento 'playing' é disparado quando o vídeo realmente começa a tocar após buffer/seek
videoPlayer.addEventListener('playing', () => {
    console.log('[Player] Playing (após buffer/seek)');
    // Garante que o estado 'isPlaying' e 'startTime' estejam corretos
    if (!isPlaying) {
        isPlaying = true;
        startTime = new Date();
        if (!viewStarted) startTrackingSession();
        startHeartbeat();
    }
});


// Evento 'pause'
videoPlayer.addEventListener('pause', () => {
    console.log('[Player] Pause');
    if (!viewStarted) return; // Não faz nada se a sessão não começou

    updateWatchDuration(); // Calcula duração do último segmento tocado
    isPlaying = false;
    clearInterval(heartbeatInterval); // Para heartbeat
    if (videoPlayer.duration > 0) {
         sendTrackingData('pause', {
            duration: watchDuration,
            progress: videoPlayer.currentTime / videoPlayer.duration
         });
    }
});

// Evento 'ended' (vídeo chegou ao fim)
videoPlayer.addEventListener('ended', () => {
    console.log('[Player] Ended');
    if (!viewStarted) return;

    updateWatchDuration(); // Calcula último segmento
    isPlaying = false;
    clearInterval(heartbeatInterval);
    sendTrackingData('complete', {
        duration: watchDuration,
        completed: true
    });
});

// Evento 'seeked' (usuário pulou no vídeo)
videoPlayer.addEventListener('seeked', () => {
    console.log(`[Player] Seeked to ${videoPlayer.currentTime.toFixed(2)}s`);
    if (!viewStarted) return;
    // Reinicia startTime se estava tocando, para calcular corretamente a duração após o seek
    if (isPlaying) {
        startTime = new Date();
    }
    // Pode-se enviar um evento de seek se for relevante para as estatísticas
});


// --- Tracking de Saída da Página ---
window.addEventListener('beforeunload', () => {
    console.log('[Tracking] Usuário saindo da página...');
    if (!viewStarted) return; // Se não começou a ver, não envia 'exit'

    updateWatchDuration(); // Calcula o último pedaço assistido
    clearInterval(heartbeatInterval);

    // Usar sendBeacon é preferível pois funciona mesmo com a página fechando
    // O backend precisa ser capaz de receber 'application/json' ou 'text/plain'
    if (navigator.sendBeacon) {
         const data = JSON.stringify({
            sessionId,
            duration: watchDuration,
            progress: (videoPlayer && videoPlayer.duration > 0) ? videoPlayer.currentTime / videoPlayer.duration : 0
         });
         try {
           const sent = navigator.sendBeacon('/track/exit', new Blob([data], { type: 'application/json' }));
           console.log(`[Tracking] sendBeacon para 'exit' ${sent ? 'enfileirado' : 'falhou'}.`);
         } catch (e) {
             console.error("[Tracking] Erro ao usar sendBeacon:", e);
             // Fallback para fetch síncrono pode não funcionar, mas tentamos
             sendTrackingData('exit', { duration: watchDuration, progress: videoPlayer.currentTime / videoPlayer.duration });
         }
    } else {
        // Fallback para fetch (menos confiável no unload)
        sendTrackingData('exit', { duration: watchDuration, progress: videoPlayer.currentTime / videoPlayer.duration });
    }
});

// --- Inicialização ---
// A sessão de tracking começa quando o usuário dá o primeiro 'play'.
// Autoplay pode ser bloqueado, então confiar no evento 'play' é mais robusto.
console.log('[Frontend] Event listeners configurados.');

