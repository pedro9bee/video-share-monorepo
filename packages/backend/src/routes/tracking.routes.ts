import { Router, Request, Response } from 'express';
import { StatsService } from '../services/stats.service';
import { logError } from '../utils/logger';

const router = Router();

// Validação básica do corpo da requisição
const validateTrackingBody = (body: any): boolean => {
  return body && typeof body.sessionId === 'string';
};

router.post('/start', (req: Request, res: Response) => {
  const { sessionId, userAgent, language, screenSize, timestamp } = req.body;
  if (!sessionId) return res.status(400).send('Missing sessionId');

  // Os dados adicionais são opcionais
  StatsService.startSession(sessionId, {
    userAgent,
    language,
    screenSize,
    timestamp, // Passa o timestamp do cliente, se houver
    ip: req.ip,
  });
  res.sendStatus(200);
});

router.post('/heartbeat', (req: Request, res: Response) => {
  if (!validateTrackingBody(req.body)) return res.status(400).send('Invalid body');
  const { sessionId, duration, progress } = req.body;
  StatsService.updateSession(sessionId, duration, progress);
  res.sendStatus(200);
});

router.post('/pause', (req: Request, res: Response) => {
  if (!validateTrackingBody(req.body)) return res.status(400).send('Invalid body');
  const { sessionId, duration, progress } = req.body;
  StatsService.updateSession(sessionId, duration, progress);
  res.sendStatus(200);
});

router.post('/complete', (req: Request, res: Response) => {
  if (!validateTrackingBody(req.body)) return res.status(400).send('Invalid body');
  const { sessionId, duration } = req.body;
  StatsService.finalizeSession(sessionId, duration, 1.0, true);
  res.sendStatus(200);
});

router.post('/exit', (req: Request, res: Response) => {
  // sendBeacon pode não ter Content-Type correto, mas express.json deve tratar
   try {
      if (!validateTrackingBody(req.body)) return res.status(400).send('Invalid body or missing sessionId');
      const { sessionId, duration, progress } = req.body;
      StatsService.finalizeSession(sessionId, duration, progress, false);
      res.sendStatus(200);
   } catch (e) {
      logError("Erro ao processar track/exit:", e, "Body:", req.body);
      res.status(400).send("Invalid request body");
   }
});

router.post('/error', (req: Request, res: Response) => {
  // Não requer sessionId obrigatório, mas é útil
  const { sessionId, errorCode, errorMessage } = req.body;
  logError(`\n‼️ Erro no Player (Sessão: ${sessionId ? sessionId.substring(0,8) : 'N/A'}...): Code ${errorCode || 'N/A'}, ${errorMessage || 'N/A'}`);
  // Poderia salvar esse erro nas estatísticas se desejado
  res.sendStatus(200);
});


export default router;