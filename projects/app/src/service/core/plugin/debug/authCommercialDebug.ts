import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { assertPluginRemoteDebugEnabled } from '@fastgpt/service/core/plugin/debug/policy';

/**
 * 创建、刷新和兑换调试连接同时校验商业授权与当前管理员开关；查询和撤销不受开关限制。
 */
export function assertCommercialPluginDebugEnabled() {
  if (!global.feConfigs?.isPlus) {
    throw SystemErrEnum.commercialFeature;
  }
  assertPluginRemoteDebugEnabled();
}
