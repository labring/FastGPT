import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { importSystemModels } from '@/service/core/ai/model/service';
import {
  UpdateSystemModelsWithJsonBodySchema,
  type UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(req: ApiRequestProps<UpdateSystemModelsWithJsonBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;

  return importSystemModels({ config });
}

export default NextAPI(handler);
