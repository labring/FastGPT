import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { deleteDatasetData } from '@/service/core/dataset/data/data';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteDatasetDataQuerySchema,
  DeleteDatasetDataResponseSchema,
  type DeleteDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps): Promise<DeleteDatasetDataResponse> {
  const { id: dataId } = parseApiInput({ req, querySchema: DeleteDatasetDataQuerySchema }).query;

  // 凭证校验
  const { datasetData, tmbId, teamId, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  await deleteDatasetData(datasetData);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_DATA,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
  return DeleteDatasetDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);
