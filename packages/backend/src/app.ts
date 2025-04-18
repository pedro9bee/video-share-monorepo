// packages/backend/src/app.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors'; // <-- Importar cors
import config from './config';
import mainRouter from './routes';
import { logDebug, logError, logInfo } from './utils/logger';
import fs from 'fs';
import path from 'path';

const app: Express = express();

// --- Middlewares Essenciais ---
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    logDebug(`Request: ${req.method} ${req.originalUrl} from ${req.ip}`);
    res.on('finish', () => {
        logDebug(`Response: ${req.method} ${req.originalUrl} ${res.statusCode}`);
    });
    next();
});

// --- CORS Middleware (APENAS em DEV) ---
if (config.IS_DEV) {
  const corsOptions = {
    // Permite requisições SOMENTE da origem do servidor de dev do frontend
    origin: 'http://localhost:8080',
    optionsSuccessStatus: 200 // Necessário para alguns navegadores legados ou proxies
  };
  app.use(cors(corsOptions)); // <-- Usar o middleware cors com as opções
  logInfo(`[INFO] CORS habilitado para origem: ${corsOptions.origin}`);
}

// --- Montar Rotas da API ---
// Deve vir DEPOIS do middleware CORS
app.use(mainRouter); // Lida com /video, /track, /stats etc.

// --- Servir Arquivos Estáticos APENAS EM PRODUÇÃO ---
if (config.IS_PROD) {
    logInfo(`[INFO] Modo Produção: Configurando express.static para servir de: ${config.FRONTEND_BUILD_PATH_PROD}`);
    if (fs.existsSync(config.FRONTEND_BUILD_PATH_PROD)) {
        app.use(express.static(config.FRONTEND_BUILD_PATH_PROD));
        // Fallback para SPAs (opcional, mas útil)
        app.get('*', (req, res) => {
           logDebug(`[SPA Fallback] Servindo index.html para ${req.originalUrl}`);
           res.sendFile(path.resolve(config.FRONTEND_BUILD_PATH_PROD, 'index.html'));
        });
    } else {
        logError(`[ERRO] Modo Produção: Diretório de build do frontend NÃO encontrado em ${config.FRONTEND_BUILD_PATH_PROD}`);
        app.use('*', (req, res) => {
            res.status(503).send('Erro: Aplicação frontend não encontrada. Contate o administrador.');
        });
    }
} else {
    logInfo("[INFO] Modo Desenvolvimento: O backend NÃO servirá arquivos estáticos do frontend. Use o servidor de desenvolvimento do frontend (Rollup serve em :8080).");
}

// --- Tratamento de Rota Não Encontrada (404) ---
app.use((req: Request, res: Response, next: NextFunction) => {
    logError(`[404 Handler] Rota da API não encontrada ou recurso inválido: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: `Rota não encontrada ou inválida: ${req.originalUrl}` });
});

// --- Tratamento de Erro Genérico ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logError('Erro de API não tratado:', err.stack || err.message);
  res.status(500).json({ message: 'Erro interno do servidor (API)' });
});

export default app;