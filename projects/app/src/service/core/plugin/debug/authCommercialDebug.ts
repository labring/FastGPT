import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';

/**
 * 系统工具远程调试依赖商业版能力；API 层统一拦截，避免绕过前端直接创建或使用调试通道。
 */
export function assertCommercialPluginDebugEnabled() {
  if (!global.feConfigs?.isPlus) {
    throw SystemErrEnum.commercialFeature;
  }
}
