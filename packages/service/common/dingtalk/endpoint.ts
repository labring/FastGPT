import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';
import { logInstanceConfigRead } from '../system/migrationCoverageLog';

/**
 * 解析钉钉 API 基础地址（v1.0 接口与 oapi 老接口两套域名）。
 *
 * 运行时唯一来源是实例配置 providers.dataSource.dingtalk*（见
 * .agents/design/common/admin-instance-config-env-boundary.md 13.1：运行期 `|| serviceEnv` 兜底已废除，
 * DINGTALK_BASE_URL 只在启动迁移时 seed 进库）。
 * common/dingtalk（accessToken 鉴权）与 core/dataset（知识库拉取）共用本 helper，
 * 避免两处各自实现导致某处修正（如空值判定）遗漏、鉴权与业务请求打到不同域名。
 * 部署方可能把地址配成内网代理，因此两处调用均不使用 SSRF 拦截器。
 */
export const getDingtalkBaseUrl = () => {
  const value = getSystemInstanceConfig().providers.dataSource.dingtalkBaseUrl;
  logInstanceConfigRead({
    callsite: 'runtime.common.dingtalk.endpoint.getDingtalkBaseUrl',
    fields: [{ path: 'providers.dataSource.dingtalkBaseUrl', value }]
  });
  return value;
};

export const getDingtalkOapiBaseUrl = () => {
  const value = getSystemInstanceConfig().providers.dataSource.dingtalkOapiBaseUrl;
  logInstanceConfigRead({
    callsite: 'runtime.common.dingtalk.endpoint.getDingtalkOapiBaseUrl',
    fields: [{ path: 'providers.dataSource.dingtalkOapiBaseUrl', value }]
  });
  return value;
};
