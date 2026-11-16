import { appEnv } from '@/env';
import { serviceEnv } from '@fastgpt/service/env';

/**
 * 在最终 feConfigs 合成处应用 ENV 独占字段。
 *
 * 旧库值及 Pro 能力响应不能覆盖这些字段。配置 PRO_URL 即视为商业版，
 * Git 展示由 App 的 SHOW_GIT 决定，与 License 激活状态无关；开源版固定展示。
 */
export const applyEnvAuthoritativeFeConfigs = <T extends { chineseRedirectUrl?: string }>(
  feConfigs: T
) => ({
  ...feConfigs,
  chineseRedirectUrl: appEnv.CHINESE_IP_REDIRECT_URL,
  show_git: serviceEnv.PRO_URL ? appEnv.SHOW_GIT : true
});
