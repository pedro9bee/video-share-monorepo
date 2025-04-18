import path from 'path';
import config from '../config';
import fs from 'fs';
import { logDebug, logError, logInfo, logWarn } from '../utils/logger';
import { RuntimeStats, StatsData, ViewDetails, ActiveSession, ViewDuration } from '../types/stats.types';

const statsDir = path.resolve(__dirname, '../../stats');
const statsFile = path.join(statsDir, 'stats_data.json');

// Estado inicial em memória (CORRIGIDO)
let runtimeStats: RuntimeStats = {
  videoName: path.basename(config.VIDEO_PATH), // Inicializa com o nome do vídeo do config
  totalViews: 0,
  firstView: null,
  lastView: null,
  viewDuration: [],
  viewDetails: [],
  activeSessions: {}, // Inicializa como objeto vazio
};

const loadStats = (): void => {
  if (!fs.existsSync(statsDir)) { /* ... */ }

  if (fs.existsSync(statsFile)) {
    try {
      const fileData = fs.readFileSync(statsFile, 'utf8');
      const persistedStats: StatsData = JSON.parse(fileData);
      runtimeStats = {
        ...runtimeStats, // Mantém activeSessions vazio inicial e videoName
        ...persistedStats, // Sobrescreve o resto com dados do arquivo
        activeSessions: {}, // Garante que activeSessions está sempre vazio ao carregar
      };
      logInfo('Estatísticas carregadas do arquivo.', { totalViews: runtimeStats.totalViews });
    } catch (error) {
      logError('Erro ao carregar ou parsear estatísticas, iniciando com dados zerados:', error);
      // Reseta para estado inicial seguro
      runtimeStats = {
          videoName: path.basename(config.VIDEO_PATH), totalViews: 0, firstView: null, lastView: null,
          viewDuration: [], viewDetails: [], activeSessions: {}
      };
    }
  } else {
    logInfo('Arquivo de estatísticas não encontrado, iniciando com dados zerados.');
  }
};

const saveStats = (): void => {
  const statsToSave: StatsData = {
    videoName: runtimeStats.videoName,
    totalViews: runtimeStats.totalViews,
    firstView: runtimeStats.firstView,
    lastView: runtimeStats.lastView,
    viewDuration: runtimeStats.viewDuration,
    viewDetails: runtimeStats.viewDetails,
  };
  try {
     if (!fs.existsSync(statsDir)) { fs.mkdirSync(statsDir, { recursive: true }); }
    fs.writeFileSync(statsFile, JSON.stringify(statsToSave, null, 2));
    logDebug('Estatísticas salvas no arquivo.');
  } catch (error) { logError('Erro ao salvar estatísticas no arquivo:', error); }
};

const addVisit = (ip?: string, userAgent?: string, referrer?: string): void => {
    const timestamp = new Date().toISOString();
    if (!runtimeStats.firstView) runtimeStats.firstView = timestamp;
    runtimeStats.lastView = timestamp;
    runtimeStats.totalViews++;

    const viewInfo: ViewDetails = {
        timestamp, ip: ip || 'N/A', userAgent: userAgent || 'N/A',
        referrer: referrer || 'direct', id: `view_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
    runtimeStats.viewDetails.push(viewInfo);
    logInfo(`\n🎉 Nova visita #${runtimeStats.totalViews} de ${ip || 'IP desconhecido'}`);
    saveStats();
};

const startSession = (sessionId: string, data: Omit<ActiveSession, 'start' | 'lastActive' | 'duration' | 'progress' | 'completed'> & { timestamp?: string }): void => {
    if (runtimeStats.activeSessions[sessionId]) {
        logWarn(`Tentativa de iniciar sessão já existente: ${sessionId}`);
        return;
    }
    // Atribui o objeto completo (CORRIGIDO)
    runtimeStats.activeSessions[sessionId] = {
        start: new Date(data.timestamp || Date.now()),
        lastActive: new Date(),
        userAgent: data.userAgent || 'N/A',
        language: data.language || 'N/A',
        screenSize: data.screenSize || 'N/A',
        ip: data.ip, // ip é opcional na interface
        duration: 0, // Valor inicial
        progress: 0, // Valor inicial
        completed: false, // Valor inicial
    };
     logInfo(`\n▶️ Visualização iniciada: ${sessionId.substring(0, 8)}... (${data.ip || 'IP desconhecido'})`);
     logDebug('Detalhes da sessão iniciada:', runtimeStats.activeSessions[sessionId]);
};

const updateSession = (sessionId: string, duration: number, progress: number): void => {
    const session = runtimeStats.activeSessions[sessionId]; // Pega a sessão para facilitar
    if (!session) {
        logWarn(`Tentativa de atualizar sessão inexistente: ${sessionId}`);
        return;
    }
    session.lastActive = new Date();
    session.duration = Math.max(duration || 0, 0);
    session.progress = Math.min(Math.max(progress || 0, 0), 1);
    logDebug(`Sessão atualizada: ${sessionId.substring(0, 8)}... Progresso: ${Math.round(session.progress * 100)}%`);
};

const finalizeSession = (sessionId: string, finalDuration: number, finalProgress: number, isCompleted: boolean): void => {
  const session = runtimeStats.activeSessions[sessionId];
  if (!session) {
    logDebug(`Tentativa de finalizar sessão já encerrada ou inválida: ${sessionId}`);
    return;
  }

  const finalProg = Math.min(Math.max(finalProgress || 0, 0), 1);
  const finalDur = Math.max(finalDuration || 0, 0);

  const viewDurationData: ViewDuration = {
    sessionId,
    duration: finalDur,
    progress: finalProg,
    completed: isCompleted || finalProg >= 0.95,
    timestamp: new Date().toISOString(),
    device: session.userAgent, // Mapeia userAgent para device
    ip: session.ip,
  };
  runtimeStats.viewDuration.push(viewDurationData);

  const status = viewDurationData.completed ? '✅ Completado' : '👋 Saiu';
  logInfo(`\n${status}: ${sessionId.substring(0, 8)}...`);
  logInfo(`   ⏱️ Duração: ${Math.round(finalDur)}s`);
  logInfo(`   📊 Progresso: ${Math.round(finalProg * 100)}%`);

  delete runtimeStats.activeSessions[sessionId];
  saveStats();
};

// Interface para o tipo de retorno do sumário
interface StatsSummary extends Partial<Omit<StatsData, 'viewDuration' | 'viewDetails'>> { // Omit arrays
    activeSessionsCount: number;
    viewDurationCount: number;
    viewDetailsCount: number;
}

const getStatsSummary = (): StatsSummary => {
    return {
        videoName: runtimeStats.videoName,
        totalViews: runtimeStats.totalViews,
        firstView: runtimeStats.firstView,
        lastView: runtimeStats.lastView,
        viewDurationCount: runtimeStats.viewDuration.length, // Conta os itens
        viewDetailsCount: runtimeStats.viewDetails.length,   // Conta os itens
        activeSessionsCount: Object.keys(runtimeStats.activeSessions).length,
    };
};

// Exporta as funções que serão usadas externamente
export const StatsService = {
    loadStats,
    saveStats,
    addVisit,
    startSession,
    updateSession,
    finalizeSession,
    getStatsSummary,
};