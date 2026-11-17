import { serviceEnv } from '../../env';

/**
 * 解析飞书开放平台基础地址。
 *
 * 地址仅由部署 ENV 提供；飞书知识库与 Pro 外链共用本 helper，确保鉴权与业务请求同源。
 */
export const getFeishuBaseUrl = () => serviceEnv.FEISHU_BASE_URL;
