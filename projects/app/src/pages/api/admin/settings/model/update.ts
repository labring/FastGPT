import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelBodySchema,
  type UpdateSystemModelBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { updateSystemModel } from '@/service/core/ai/model/service';

async function handler(req: ApiRequestProps<UpdateSystemModelBody>): Promise<void> {
  await authSystemAdmin({ req });
  const input = parseApiInput({
    req,
    bodySchema: UpdateSystemModelBodySchema
  }).body;

  await updateSystemModel(input);
}

export default NextAPI(handler);
