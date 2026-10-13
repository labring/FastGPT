import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import {
  UpdateSystemModelsWithJsonBodySchema,
  type UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { importSystemModels } from '@fastgpt/service/core/ai/model/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: ApiRequestProps<UpdateSystemModelsWithJsonBody>): Promise<void> {
  const actor = await authUserPer({ req, authToken: true });
  if (!actor.isRoot) throw ModelErrEnum.rootOnlyPermit;
  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;

  return importSystemModels({ config });
}

export default NextAPI(handler);
