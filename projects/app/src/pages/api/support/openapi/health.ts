import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiKeyHealthResponseType } from '@fastgpt/global/openapi/support/openapi/api';
import {
  ApiKeyHealthParamsSchema,
  ApiKeyHealthResponseSchema
} from '@fastgpt/global/openapi/support/openapi/api';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { resolveOpenApiCredential } from '@fastgpt/service/support/openapi/auth';
import { useIPFrequencyLimit } from '../../../../../../../packages/service/common/middle/reqFrequencyLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export async function handler(req: ApiRequestProps): Promise<ApiKeyHealthResponseType> {
  const { apiKey } = parseApiInput({
    req,
    querySchema: ApiKeyHealthParamsSchema
  }).query;
  const { apikey } = resolveOpenApiCredential(apiKey);
  const apiKeyDoc = await MongoOpenApi.findOne({ apiKey: apikey }).lean();

  if (!apiKeyDoc) {
    return Promise.reject('APIKey invalid');
  }

  return ApiKeyHealthResponseSchema.parse({
    valid: true,
    usagePoints: apiKeyDoc.usagePoints ?? 0,
    maxUsagePoints: apiKeyDoc.limit?.maxUsagePoints ?? -1,
    appId: apiKeyDoc.appId
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'openapi-health', seconds: 1, limit: 1 }),
  handler
);
