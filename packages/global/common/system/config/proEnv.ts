import z from 'zod';
import { FastGPTTeamModeSchema } from '../types';

/** Pro ENV 独占的共享 scope；只发布 App 所需能力和服务端 SSO 地址，不包含凭据。 */
export const ProEnvConfigSchema = z.strictObject({
  teamMode: FastGPTTeamModeSchema.default('single'),
  ssoUrl: z.union([z.url(), z.literal('')]).default(''),
  login2faEnabled: z.boolean().default(false),
  show_workorder: z.boolean().default(false),
  show_enterprise_auth: z.boolean().default(false),
  showWecomConfig: z.boolean().default(false)
});
export type ProEnvConfig = z.infer<typeof ProEnvConfigSchema>;
