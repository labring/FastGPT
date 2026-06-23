import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetApiKeyListQuerySchema,
  GetApiKeyListResponseSchema,
  type GetApiKeyListQueryType,
  type GetApiKeyListResponseType
} from '@fastgpt/global/openapi/support/openapi/api';

async function handler(
  req: ApiRequestProps<any, GetApiKeyListQueryType>
): Promise<GetApiKeyListResponseType> {
  parseApiInput({
    req,
    querySchema: GetApiKeyListQuerySchema
  });
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  const findResponse = await MongoOpenApi.find({
    teamId,
    tmbId
  }).sort({ _id: -1 });

  return GetApiKeyListResponseSchema.parse(
    findResponse.map((item) => ({
      ...item.toObject({ getters: true }),
      canCopy: true
    }))
  );
}

export default NextAPI(handler);
