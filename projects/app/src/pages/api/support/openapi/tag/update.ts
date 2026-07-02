import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateOpenApiTagBodySchema,
  UpdateOpenApiTagResponseSchema,
  type UpdateOpenApiTagBodyType,
  type UpdateOpenApiTagResponseType
} from '@fastgpt/global/openapi/support/openapi/tag';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateOpenApiTag } from '@fastgpt/service/support/openapi/tag/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<UpdateOpenApiTagBodyType>
): Promise<UpdateOpenApiTagResponseType> {
  const { tagId, name, order } = parseApiInput({
    req,
    bodySchema: UpdateOpenApiTagBodySchema
  }).body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  await updateOpenApiTag({
    teamId,
    tmbId,
    tagId,
    name,
    order
  });

  return UpdateOpenApiTagResponseSchema.parse(undefined);
}

export default NextAPI(handler);
