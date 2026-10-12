import { authModelConfig } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateModelBodySchema,
  type UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateModel } from '@fastgpt/service/core/ai/model/service';

async function handler(req: ApiRequestProps<UpdateModelBody>): Promise<void> {
  const input = parseApiInput({
    req,
    bodySchema: UpdateModelBodySchema
  }).body;
  const {
    actor: { tmbId, teamId }
  } = await authModelConfig({ req, modelIds: [input.modelId], channelType: input.channelType });

  await updateModel({ ...input, teamId, tmbId });
}

export default NextAPI(handler);
