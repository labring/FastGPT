import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModelsFromTemplatesWithLifecycle } from '@fastgpt/service/core/ai/model/lifecycle';
import {
  CreateModelsFromTemplatesBodySchema,
  type CreateModelsFromTemplatesBody,
  CreateModelsFromTemplatesResponseSchema,
  type CreateModelsFromTemplatesResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<CreateModelsFromTemplatesBody>
): Promise<CreateModelsFromTemplatesResponse> {
  const { templates, channelType, channelIds } = parseApiInput({
    req,
    bodySchema: CreateModelsFromTemplatesBodySchema
  }).body;

  const { tmbId, teamId } = await authModelManage({ req, channelType });

  const result = await createModelsFromTemplatesWithLifecycle({
    templates,
    channelIds,
    channelType,
    tmbId: channelType === 'team' ? tmbId : undefined,
    teamId: channelType === 'team' ? teamId : undefined
  });

  return CreateModelsFromTemplatesResponseSchema.parse(result);
}

export default NextAPI(handler);
