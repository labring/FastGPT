import { deleteSystemModels } from '@/service/core/ai/model/service';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  DeleteSystemModelsBodySchema,
  type AdminSystemModelReference,
  type DeleteSystemModelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

async function handler(
  req: ApiRequestProps<DeleteSystemModelsBody, AdminSystemModelReference>
): Promise<void> {
  await authSystemAdmin({ req });
  const modelIds = (() => {
    if (Array.isArray(req.body?.modelIds)) {
      return parseApiInput({ req, bodySchema: DeleteSystemModelsBodySchema }).body.modelIds;
    }
    const { modelId } = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
    return [modelId];
  })();

  return deleteSystemModels({ modelIds });
}

export default NextAPI(handler);
