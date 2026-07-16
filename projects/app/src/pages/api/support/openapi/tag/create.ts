import { NextAPI } from '@/service/middleware/entry';
import {
  CreateOpenApiTagBodySchema,
  CreateOpenApiTagResponseSchema,
  type CreateOpenApiTagBodyType,
  type CreateOpenApiTagResponseType
} from '@fastgpt/global/openapi/support/openapi/tag';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createOpenApiTag } from '@fastgpt/service/support/openapi/tag/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

async function handler(
  req: ApiRequestProps<CreateOpenApiTagBodyType>
): Promise<CreateOpenApiTagResponseType> {
  const { name } = parseApiInput({
    req,
    bodySchema: CreateOpenApiTagBodySchema
  }).body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  const tag = await createOpenApiTag({
    teamId,
    tmbId,
    name
  });

  return CreateOpenApiTagResponseSchema.parse(tag);
}

export default NextAPI(handler);
