import { getSystemInstanceConfig } from '../system/systemInstanceConfig/controller';
import { serviceEnv } from '../../env';

/**
 * 解析钉钉 API 基础地址（v1.0 接口与 oapi 老接口两套域名）。
 *
 * 权威来源为实例配置 providers.dataSource.dingtalk*，快照叶子缺省时回落 env；
 * common/dingtalk（accessToken 鉴权）与 core/dataset（知识库拉取）共用本 helper，
 * 避免两处各自实现导致某处修正（如空值判定）遗漏、鉴权与业务请求打到不同域名。
 * 部署方可能把 env 配成内网代理，因此两处调用均不使用 SSRF 拦截器。
 */
export const getDingtalkBaseUrl = () =>
  getSystemInstanceConfig().providers.dataSource.dingtalkBaseUrl || serviceEnv.DINGTALK_BASE_URL;

export const getDingtalkOapiBaseUrl = () =>
  getSystemInstanceConfig().providers.dataSource.dingtalkOapiBaseUrl ||
  serviceEnv.DINGTALK_OAPI_BASE_URL;
