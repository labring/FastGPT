import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiKeyHealthResponseType } from '@fastgpt/global/openapi/support/openapi/api';
import { ApiKeyHealthResponseSchema } from '@fastgpt/global/openapi/support/openapi/api';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getAppByApiKey } from '@fastgpt/service/support/openapi/auth';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

/**
 * 校验请求头中的 API Key 是否有效，并返回密钥类型、积分用量与绑定应用信息。
 * 支持 `Authorization: Bearer <apiKey>` 以及直接传入 `<apiKey>`。
 */
export async function handler(req: ApiRequestProps): Promise<ApiKeyHealthResponseType> {
  const parseAuthorizationApiKey = (authorization?: string | string[]) => {
    const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;
    const trimmed = rawHeader?.trim() ?? '';
    if (!trimmed) return '';

    const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
    return (bearerMatch ? bearerMatch[1] : trimmed).trim();
  };

  const apiKey = parseAuthorizationApiKey(req.headers?.authorization);
  const certificate = await parseHeaderCert({
    req: { ...req, headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
    authApiKey: true,
    authAppApiKey: true
  });
  if (certificate.apiKeyType === ApiKeyTypeEnum.app) await getAppByApiKey(certificate);
  const apiKeyDoc = await MongoOpenApi.findById(certificate.apiKeyId).lean();

  if (!apiKeyDoc) {
    return Promise.reject('APIKey invalid');
  }

  return ApiKeyHealthResponseSchema.parse({
    valid: true,
    type: certificate.apiKeyType,
    usagePoints: apiKeyDoc.usagePoints ?? 0,
    maxUsagePoints: apiKeyDoc.limit?.maxUsagePoints ?? -1,
    appId: certificate.boundAppId
  });
}

export default NextAPI(handler, { redactQueryParams: ['apiKey'] });
