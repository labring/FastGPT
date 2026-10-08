import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelManage } from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModelWithLifecycle } from '@fastgpt/service/core/ai/model/lifecycle';
import { resolveChannelType } from '@fastgpt/global/core/ai/model';
import {
  CreateModelBodySchema,
  type CreateModelBody,
  CreateModelResponseSchema,
  type CreateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<CreateModelBody>): Promise<CreateModelResponse> {
  const { modelData, channelIds, channelType } = parseApiInput({
    req,
    bodySchema: CreateModelBodySchema
  }).body;
  const resolvedType = resolveChannelType({ channelType, scope: modelData.scope });

  const { tmbId, teamId } = await authModelManage({ req, channelType: resolvedType });

  const createResult = await createModelWithLifecycle({
    modelData,
    channelType: resolvedType,
    channelIds,
    tmbId,
    teamId
  });

  return CreateModelResponseSchema.parse(createResult);
}

export default NextAPI(handler);
