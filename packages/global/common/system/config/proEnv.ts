import z from 'zod';
import {
  FastGPTConfigFileSchema,
  FastGPTTeamModeSchema,
  type FastGPTConfigFileType
} from '../types';

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

/** 只在内存中生成旧前端协议投影；数据库存储保持独立 scope，不保存 feConfigs/systemEnv。 */
export const projectProEnvConfig = (config: ProEnvConfig): FastGPTConfigFileType =>
  FastGPTConfigFileSchema.parse({
    feConfigs: {
      teamMode: config.teamMode,
      sso: { enabled: Boolean(config.ssoUrl) },
      login2faEnabled: config.login2faEnabled,
      show_workorder: config.show_workorder,
      show_enterprise_auth: config.show_enterprise_auth,
      showWecomConfig: config.showWecomConfig
    },
    systemEnv: { sso: { url: config.ssoUrl } }
  });
