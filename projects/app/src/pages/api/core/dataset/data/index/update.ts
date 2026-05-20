import { updateDatasetDataIndex } from '@/service/core/dataset/data/dataIndex';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateDatasetDataIndexBodySchema,
  DatasetDataIndexResponseSchema,
  type DatasetDataIndexResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<DatasetDataIndexResponse> {
  const { dataId, indexDataId, type, text } = parseApiInput({
    req,
    bodySchema: UpdateDatasetDataIndexBodySchema
  }).body;

  const { datasetData, tmbId, teamId, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  const { index, tokens } = await updateDatasetDataIndex({
    data: datasetData,
    indexDataId,
    type,
    text,
    model: collection.dataset.vectorModel
  });

  if (tokens > 0) {
    pushGenerateVectorUsage({
      teamId,
      tmbId,
      inputTokens: tokens,
      model: collection.dataset.vectorModel
    });
  }

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

  return DatasetDataIndexResponseSchema.parse({
    index
  });
}

export default NextAPI(handler);
