import { NextAPI } from '@/service/middleware/entry';
import {
  GetOpenApiTagListQuerySchema,
  GetOpenApiTagListResponseSchema,
  type GetOpenApiTagListQueryType,
  type GetOpenApiTagListResponseType
} from '@fastgpt/global/openapi/support/openapi/tag';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { listOpenApiTags } from '@fastgpt/service/support/openapi/tag/service';
import type { ApiRequestProps } from '@fastgpt/next/types';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetOpenApiTagListQueryType>
): Promise<GetOpenApiTagListResponseType> {
  const { withKeyCount } = parseApiInput({
    req,
    querySchema: GetOpenApiTagListQuerySchema
  }).query;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  const tags = await listOpenApiTags({
    teamId,
    tmbId,
    withKeyCount
  });

  return GetOpenApiTagListResponseSchema.parse(tags);
}

export default NextAPI(handler);
