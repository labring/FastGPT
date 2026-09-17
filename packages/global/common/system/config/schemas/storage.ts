import z from 'zod';
import { positiveInteger, positiveNumber } from './primitives';

export const StorageConfigSchema = z.strictObject({
  downloadMode: z.enum(['short-proxy', 'short-redirect']).default('short-proxy'),
  downloadRedirectTtlSeconds: positiveInteger(300),
  fileUrlExpiredDays: positiveNumber(90)
});
