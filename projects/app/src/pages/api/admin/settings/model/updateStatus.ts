import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelStatusBodySchema,
  type UpdateSystemModelStatusBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { updateSystemModelStatus } from '@fastgpt/service/core/ai/config/service';

async function handler(req: ApiRequestProps<UpdateSystemModelStatusBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { modelIds, isActive } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelStatusBodySchema
  }).body;

  await updateSystemModelStatus({ modelIds, isActive });
}

export default NextAPI(handler);
