import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { importSystemModelsWithLifecycle } from '@fastgpt/service/core/ai/model/lifecycle';
import {
  UpdateSystemModelsWithJsonBodySchema,
  type UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<UpdateSystemModelsWithJsonBody>): Promise<void> {
  await authModelScopeOperation({ req, channelType: 'system' });
  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;

  return importSystemModelsWithLifecycle({ config });
}

export default NextAPI(handler);
