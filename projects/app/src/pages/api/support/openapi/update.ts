import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
async function handler(req: ApiRequestProps<EditApiKeyProps & { _id: string }>): Promise<void> {
  const { _id, name, limit } = req.body;

  const { tmbId, teamId } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id: _id,
    per: OwnerPermissionVal
  });

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.UPDATE_API_KEY,
      params: {
        keyName: name
      }
    });
  })();

  await MongoOpenApi.findByIdAndUpdate(_id, {
    ...(name && { name }),
    ...(limit && { limit })
  });
}

export default NextAPI(handler);
