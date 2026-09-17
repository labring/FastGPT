import z from 'zod';
import { positiveInteger } from './primitives';

export const SecurityConfigSchema = z.strictObject({
  useIpLimit: z.boolean().default(false),
  checkInternalIp: z.boolean().default(false),
  csrfEnabled: z.boolean().default(true),
  passwordLoginMinuteLimitCount: positiveInteger(10),
  maxLoginSession: positiveInteger(10),
  allowedOrigins: z.array(z.string().min(1).max(2048)).max(100).default([]),
  skipFileTypeCheck: z.boolean().default(false)
});
