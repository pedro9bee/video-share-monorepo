import { Router, Request, Response } from 'express';
import { StatsService } from '../services/stats.service';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const summary = StatsService.getStatsSummary();
  res.json(summary);
});

// Opcional: Rota para obter detalhes completos (proteger se necessário)
// router.get('/details', (req: Request, res: Response) => {
//   const fullStats = StatsService.getRawStats(); // Cuidado ao expor tudo
//   res.json(fullStats);
// });

export default router;