import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';

/**
 * 创建、刷新和兑换调试连接需要商业授权；服务能力由 Plugin 服务判断。
 */
export function assertCommercialPluginDebugEnabled() {
  if (!global.feConfigs?.isPlus) {
    throw SystemErrEnum.commercialFeature;
  }
}
