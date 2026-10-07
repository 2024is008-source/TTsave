import { Router } from 'express';
import { z } from 'zod';

import { mockData } from '../data/mock-data.js';
import { HttpError } from '../middleware/error-handler.js';

const publicVideoInput = z
  .object({
    url: z
      .string()
      .trim()
      .max(2048)
      .pipe(z.url())
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          !url.port &&
          ((['tiktok.com', 'www.tiktok.com'].includes(url.hostname) &&
            /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname)) ||
            (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) &&
              /^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)))
        );
      }, 'Enter a public TikTok video link using HTTPS.'),
  })
  .strict();

export const analyzeRouter = Router();
analyzeRouter.post('/analyze', (request) => {
  publicVideoInput.parse(request.body as unknown);
  // URL syntax never proves public availability. No URL is resolved in this preview.
  throw new HttpError(503, 'DOWNLOADER_UNAVAILABLE', mockData.availability);
});
