import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createSystemModelsFromTemplates } from '@/service/core/ai/model/service';
import {
  CreateSystemModelsFromTemplatesBodySchema,
  type CreateSystemModelsFromTemplatesBody,
  CreateSystemModelsFromTemplatesResponseSchema,
  type CreateSystemModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateSystemModelsFromTemplatesBody>
): Promise<CreateSystemModelsFromTemplatesResponse> {
  await authSystemAdmin({ req });
  const { templates, channelIds } = parseApiInput({
    req,
    bodySchema: CreateSystemModelsFromTemplatesBodySchema
  }).body;

  return CreateSystemModelsFromTemplatesResponseSchema.parse(
    await createSystemModelsFromTemplates({ templates, channelIds })
  );
}

export default NextAPI(handler);
