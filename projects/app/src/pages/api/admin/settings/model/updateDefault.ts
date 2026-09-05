import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateSystemDefaultModels } from '@/service/core/ai/model/service';
import {
  UpdateDefaultModelsBodySchema,
  type UpdateDefaultModelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  await authSystemAdmin({ req });
  const defaults = parseApiInput({ req, bodySchema: UpdateDefaultModelsBodySchema }).body;
  return updateSystemDefaultModels(defaults);
}

export default NextAPI(handler);
