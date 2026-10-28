import { z } from 'zod';

export const adminHashSchema = z
  .string()
  .length(118)
  .regex(/^scrypt\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
