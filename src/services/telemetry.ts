import type { Request } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
let warned = false;
/** Operational reporting must not change extraction or delivery outcomes. */
export function operational(action: () => unknown) {
  try {
    action();
  } catch {
    if (!warned) {
      warned = true;
      logger.warn(
        { code: 'OPERATIONS_STORAGE_UNAVAILABLE' },
        'Operational reports are unavailable',
      );
    }
  }
}
export function countryFor(request: Request) {
  const code =
    env.TRUST_PROXY && env.TRUST_COUNTRY_HEADER
      ? request.get('X-TikSave-Country')
      : undefined;
  // Only the local trusted edge may supply this approved aggregate label.
  return code && /^[A-Z]{2}$/.test(code) && !['T1', 'XX'].includes(code) ? code : 'XX';
}
