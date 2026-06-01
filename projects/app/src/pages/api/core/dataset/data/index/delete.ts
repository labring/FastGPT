import { deleteDatasetDataIndex } from '@/service/core/dataset/data/dataIndex';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteDatasetDataIndexBodySchema,
  DeleteDatasetDataIndexResponseSchema,
  type DeleteDatasetDataIndexResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<DeleteDatasetDataIndexResponse> {
  const { dataId, indexDataId } = parseApiInput({
    req,
    bodySchema: DeleteDatasetDataIndexBodySchema
  }).body;

  const { datasetData, tmbId, teamId, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  await deleteDatasetDataIndex({
    data: datasetData,
    indexDataId
  });

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.UPDATE_DATA,
    params: {
      collectionName: collection.name,
      datasetName: collection.dataset?.name || '',
      datasetType: getI18nDatasetType(collection.dataset?.type || '')
    }
  });

  return DeleteDatasetDataIndexResponseSchema.parse(undefined);
}

export default NextAPI(handler);
