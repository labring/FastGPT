import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiKeyHealthResponseType } from '@fastgpt/global/openapi/support/openapi/api';
import { ApiKeyHealthParamsSchema } from '@fastgpt/global/openapi/support/openapi/api';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { useIPFrequencyLimit } from '../../../../../../../packages/service/common/middle/reqFrequencyLimit';

async function handler(
  req: ApiRequestProps,
  res: ApiResponseType<any>
): Promise<ApiKeyHealthResponseType> {
  const { apiKey } = ApiKeyHealthParamsSchema.parse(req.query);
  const apiKeyDoc = await MongoOpenApi.findOne({ apiKey }).lean();

  if (!apiKeyDoc) {
    return Promise.reject('APIKey invalid');
  }

  return {
    appId: apiKeyDoc?.appId
  };
}

export default NextAPI(
  useIPFrequencyLimit({ id: 'openapi-health', seconds: 1, limit: 1 }),
  handler
);
