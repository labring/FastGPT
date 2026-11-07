import { authModelConfig } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteModelsBodySchema,
  type DeleteModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { deleteModels } from '@fastgpt/service/core/ai/model/service';

async function handler(req: ApiRequestProps<DeleteModelsBody>): Promise<void> {
  const { modelIds, channelType } = parseApiInput({
    req,
    bodySchema: DeleteModelsBodySchema
  }).body;

  const {
    actor: { tmbId, teamId }
  } = await authModelConfig({ req, modelIds, channelType });

  await deleteModels({
    modelIds,
    channelType,
    teamId,
    tmbId
  });
}

export default NextAPI(handler);
