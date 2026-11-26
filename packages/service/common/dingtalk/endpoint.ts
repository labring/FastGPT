import { serviceEnv } from '../../env';

/**
 * 解析钉钉 API 基础地址（v1.0 接口与 oapi 老接口两套域名）。
 *
 * 两套地址仅由部署 ENV 提供。
 * common/dingtalk（accessToken 鉴权）与 core/dataset（知识库拉取）共用本 helper，
 * 避免两处各自实现导致某处修正（如空值判定）遗漏、鉴权与业务请求打到不同域名。
 * 部署方可能把地址配成内网代理，因此两处调用均不使用 SSRF 拦截器。
 */
export const getDingtalkBaseUrl = () => serviceEnv.DINGTALK_BASE_URL;

/** 读取钉钉旧版 OAPI 服务地址，默认由 ENV Schema 提供官方域名。 */
export const getDingtalkOapiBaseUrl = () => serviceEnv.DINGTALK_OAPI_BASE_URL;
