import { Router } from 'express';

export function createHealthRouter(isReady: () => boolean) {
  const healthRouter = Router();
  healthRouter.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  healthRouter.get('/ready', (_request, response) => {
    const ready = isReady();
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
  });
  return healthRouter;
}
