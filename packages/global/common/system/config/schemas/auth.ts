import z from 'zod';
import { positiveInteger } from './primitives';

export const AuthConfigSchema = z.strictObject({
  openApiKeyMaxCount: positiveInteger(100),
  passwordExpiredMonth: z.number().int().positive().nullable().default(null),
  wecomLoginAutoRedirect: z.boolean().default(false),
  defaultTeamBasicPermissionsEnabled: z.boolean().default(false)
});
