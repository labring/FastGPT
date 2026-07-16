import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteOpenApiTagQuerySchema,
  DeleteOpenApiTagResponseSchema,
  type DeleteOpenApiTagQueryType,
  type DeleteOpenApiTagResponseType
} from '@fastgpt/global/openapi/support/openapi/tag';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { deleteOpenApiTag } from '@fastgpt/service/support/openapi/tag/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/types';

async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteOpenApiTagQueryType>
): Promise<DeleteOpenApiTagResponseType> {
  const { tagId } = parseApiInput({
    req,
    querySchema: DeleteOpenApiTagQuerySchema
  }).query;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  await deleteOpenApiTag({
    teamId,
    tmbId,
    tagId
  });

  return DeleteOpenApiTagResponseSchema.parse(undefined);
}

export default NextAPI(handler);
