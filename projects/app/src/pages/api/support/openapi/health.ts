import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiKeyHealthResponseType } from '@fastgpt/global/openapi/support/openapi/api';
import {
  ApiKeyHealthParamsSchema,
  ApiKeyHealthResponseSchema
} from '@fastgpt/global/openapi/support/openapi/api';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { getAppByApiKey } from '@fastgpt/service/support/openapi/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

export async function handler(req: ApiRequestProps): Promise<ApiKeyHealthResponseType> {
  const { apiKey } = parseApiInput({
    req,
    querySchema: ApiKeyHealthParamsSchema
  }).query;
  const certificate = await parseHeaderCert({
    req: { ...req, headers: { authorization: `Bearer ${apiKey}` } },
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
