import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createSystemModel } from '@/service/core/ai/model/service';
import {
  CreateSystemModelBodySchema,
  type CreateSystemModelBody,
  CreateSystemModelResponseSchema,
  type CreateSystemModelResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateSystemModelBody>
): Promise<CreateSystemModelResponse> {
  await authSystemAdmin({ req });
  const { modelData, channelIds } = parseApiInput({
    req,
    bodySchema: CreateSystemModelBodySchema
  }).body;

  return CreateSystemModelResponseSchema.parse(await createSystemModel({ modelData, channelIds }));
}

export default NextAPI(handler);
