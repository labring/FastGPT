import { NextAPI } from '@/service/middleware/entry';
import {
  WhoamiResponseSchema,
  type WhoamiResponseType
} from '@fastgpt/global/openapi/support/user/account/whoami/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getWhoamiDetail } from '@fastgpt/service/support/user/account/whoami/service';

/**
 * 获取当前鉴权凭据主体信息。
 * 同时支持 Session Token、个人 API Key 与应用 API Key，不在查询路径触发活跃度埋点。
 */
export async function handler(req: ApiRequestProps): Promise<WhoamiResponseType> {
  const certificate = await authCert({
    req,
    authToken: true,
    authApiKey: true,
    authAppApiKey: true
  });

  const detail = await getWhoamiDetail({ certificate });

  return WhoamiResponseSchema.parse(detail);
}

export default NextAPI(handler);
