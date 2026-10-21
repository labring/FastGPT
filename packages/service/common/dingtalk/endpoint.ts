import { getSystemInstanceConfig } from '../system/systemInstanceConfig/controller';
import { logInstanceConfigRead } from '../system/migrationCoverageLog';
import { serviceEnv } from '../../env';

/**
 * 解析钉钉 API 基础地址（v1.0 接口与 oapi 老接口两套域名）。
 *
 * 权威来源为实例配置 providers.dataSource.dingtalk*，快照叶子缺省时回落 env；
 * common/dingtalk（accessToken 鉴权）与 core/dataset（知识库拉取）共用本 helper，
 * 避免两处各自实现导致某处修正（如空值判定）遗漏、鉴权与业务请求打到不同域名。
 * 部署方可能把 env 配成内网代理，因此两处调用均不使用 SSRF 拦截器。
 *
 * 注意 || 兜底的真实生效条件：schema 默认值为公网域名（快照叶子恒真值），
 * 因此兜底命中场景是"显式置空"（Admin 清空输入落库 ''、测试种子缺省）；
 * 内网代理部署的 env 初值由 blockStartup 迁移回填进覆盖项，权威链路与之一致。
 */
export const getDingtalkBaseUrl = () => {
  const configured = getSystemInstanceConfig().providers.dataSource.dingtalkBaseUrl;
  const value = configured || serviceEnv.DINGTALK_BASE_URL;
  logInstanceConfigRead({
    callsite: 'runtime.common.dingtalk.endpoint.getDingtalkBaseUrl',
    source: configured ? 'instance-config' : 'env-fallback',
    fields: [{ path: 'providers.dataSource.dingtalkBaseUrl', value: configured || value }]
  });
  return value;
};

export const getDingtalkOapiBaseUrl = () => {
  const configured = getSystemInstanceConfig().providers.dataSource.dingtalkOapiBaseUrl;
  const value = configured || serviceEnv.DINGTALK_OAPI_BASE_URL;
  logInstanceConfigRead({
    callsite: 'runtime.common.dingtalk.endpoint.getDingtalkOapiBaseUrl',
    source: configured ? 'instance-config' : 'env-fallback',
    fields: [{ path: 'providers.dataSource.dingtalkOapiBaseUrl', value: configured || value }]
  });
  return value;
};
