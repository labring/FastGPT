import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
export type OpenAPIDeleteQuery = { id: string };
export type OpenAPIDeleteBody = {};
export type OpenAPIDeleteResponse = {};

async function handler(
  req: ApiRequestProps<OpenAPIDeleteBody, OpenAPIDeleteQuery>,
  _res: ApiResponseType<any>
): Promise<OpenAPIDeleteResponse> {
  const { id } = req.query as { id: string };

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { tmbId, teamId, openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id,
    per: OwnerPermissionVal
  });

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.DELETE_API_KEY,
      params: {
        keyName: openapi.name
      }
    });
  })();

  await MongoOpenApi.deleteOne({ _id: id });

  return {};
}

export default NextAPI(handler);
