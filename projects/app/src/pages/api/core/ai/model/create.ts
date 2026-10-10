import { authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import { resolveChannelType } from '@fastgpt/global/core/ai/model/utils';
import {
  CreateModelBodySchema,
  CreateModelResponseSchema,
  type CreateModelBody,
  type CreateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createModel } from '@fastgpt/service/core/ai/model/service';

async function handler(req: ApiRequestProps<CreateModelBody>): Promise<CreateModelResponse> {
  const { modelData, channelIds, channelType } = parseApiInput({
    req,
    bodySchema: CreateModelBodySchema
  }).body;
  const resolvedType = resolveChannelType({ channelType, scope: modelData.scope });

  const { tmbId, teamId } = await authModelScope({ req, channelType: resolvedType });

  const createResult = await createModel({
    modelData,
    channelType: resolvedType,
    channelIds,
    tmbId,
    teamId
  });

  return CreateModelResponseSchema.parse(createResult);
}

export default NextAPI(handler);
