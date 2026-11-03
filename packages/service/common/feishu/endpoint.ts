import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';
import { logInstanceConfigRead } from '../system/migrationCoverageLog';

/**
 * 解析飞书开放平台基础地址。
 *
 * 实例配置 providers.dataSource.feishuBaseUrl 为权威来源；仅显式置空或测试种子
 * 叶子缺省时回落 env。飞书知识库与 Pro 外链必须共用本 helper，避免模块加载期
 * 固化域名导致 Admin 修改后仍请求旧地址。
 */
export const getFeishuBaseUrl = () => {
  const value = getSystemInstanceConfig().providers.dataSource.feishuBaseUrl;
  logInstanceConfigRead({
    callsite: 'runtime.common.feishu.endpoint.getFeishuBaseUrl',
    fields: [{ path: 'providers.dataSource.feishuBaseUrl', value }]
  });
  return value;
};
