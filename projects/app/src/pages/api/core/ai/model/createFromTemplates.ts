import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  CreateModelsFromTemplatesBodySchema,
  CreateModelsFromTemplatesResponseSchema,
  type CreateModelsFromTemplatesBody,
  type CreateModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModelsFromTemplates } from '@fastgpt/service/core/ai/model/service';

async function handler(
  req: ApiRequestProps<CreateModelsFromTemplatesBody>
): Promise<CreateModelsFromTemplatesResponse> {
  const { templates, channelType, channelIds } = parseApiInput({
    req,
    bodySchema: CreateModelsFromTemplatesBodySchema
  }).body;

  const { tmbId, teamId } = await authModelScope({ req, channelType });

  const result = await createModelsFromTemplates({
    templates,
    channelIds,
    channelType,
    teamId,
    tmbId
  });

  return CreateModelsFromTemplatesResponseSchema.parse(result);
}

export default NextAPI(handler);
