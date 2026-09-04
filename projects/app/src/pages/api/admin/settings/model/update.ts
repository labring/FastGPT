import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  type UpdateSystemModelBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { updateSystemModelConfig } from '@fastgpt/service/core/ai/config/service';

async function handler(req: ApiRequestProps<UpdateSystemModelBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { modelId, modelData } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;

  await updateSystemModelConfig({ modelId, modelData });
}

export default NextAPI(handler);
