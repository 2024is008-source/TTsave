import { Router } from 'express';
import { analyzeInput } from '../api/contracts.js';

import { mockData } from '../data/mock-data.js';
import { HttpError } from '../middleware/error-handler.js';

// Legacy form endpoint. New clients use /api/v1/analyze.
export const analyzeRouter = Router();
analyzeRouter.post('/analyze', (request) => {
  analyzeInput.parse(request.body as unknown);
  // URL syntax never proves public availability. No URL is resolved in this preview.
  throw new HttpError(503, 'DOWNLOADER_UNAVAILABLE', mockData.availability);
});
