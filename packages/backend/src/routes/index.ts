// packages/backend/src/routes/index.ts
import { Router } from 'express';
import trackingRouter from './tracking.routes';
import statsRouter from './stats.routes';
import videoRouter from './video.routes';
// NÃO importe pageRouter aqui se ele não define rotas de API

const mainRouter = Router();

// Monta os roteadores específicos da API
mainRouter.use('/video', videoRouter);     // Rota específica para o vídeo
mainRouter.use('/track', trackingRouter);  // Rotas de tracking
mainRouter.use('/stats', statsRouter);    // Rotas de estatísticas
// A rota '/' NÃO é mais tratada aqui

export default mainRouter;