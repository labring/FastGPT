import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps<EditApiKeyProps & { _id: string }>): Promise<void> {
  const { _id, name, limit } = req.body;

  await authOpenApiKeyCrud({ req, authToken: true, id: _id, per: OwnerPermissionVal });

  await MongoOpenApi.findByIdAndUpdate(_id, {
    ...(name && { name }),
    ...(limit && { limit })
  });
}

export default NextAPI(handler);
