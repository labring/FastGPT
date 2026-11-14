import { appEnv } from '@/env';

/**
 * 在最终 feConfigs 合成处应用 ENV 独占字段。
 *
 * chineseRedirectUrl 不进入实例配置，旧库 system_configs 中的值只属于历史数据；
 * 这里在展开默认值和旧库值之后显式覆盖，保证 ENV 始终是唯一来源。
 */
export const applyEnvAuthoritativeFeConfigs = <T extends { chineseRedirectUrl?: string }>(
  feConfigs: T
): T => ({
  ...feConfigs,
  chineseRedirectUrl: appEnv.CHINESE_IP_REDIRECT_URL
});
