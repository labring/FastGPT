import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiKeyHealthResponseType } from '@fastgpt/global/openapi/support/openapi/api';
import {
  ApiKeyHealthParamsSchema,
  ApiKeyHealthResponseSchema
} from '@fastgpt/global/openapi/support/openapi/api';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { useIPFrequencyLimit } from '../../../../../../../packages/service/common/middle/reqFrequencyLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<ApiKeyHealthResponseType> {
  const { apiKey } = parseApiInput({
    req,
    querySchema: ApiKeyHealthParamsSchema
  }).query;
  const apiKeyDoc = await MongoOpenApi.findOne({ apiKey }).lean();

  if (!apiKeyDoc) {
    return Promise.reject('APIKey invalid');
  }

  return ApiKeyHealthResponseSchema.parse({
    appId: apiKeyDoc?.appId
  });
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'openapi-health', seconds: 1, limit: 1 }),
  handler
);
