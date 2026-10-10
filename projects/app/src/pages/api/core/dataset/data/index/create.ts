import { createDatasetDataIndex } from '@/service/core/dataset/data/dataIndex';
import { NextAPI } from '@/service/middleware/entry';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import {
  CreateDatasetDataIndexBodySchema,
  DatasetDataIndexResponseSchema,
  type DatasetDataIndexResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: ApiRequestProps): Promise<DatasetDataIndexResponse> {
  const { dataId, type, text } = parseApiInput({
    req,
    bodySchema: CreateDatasetDataIndexBodySchema
  }).body;

  const { datasetData, tmbId, teamId, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal,
    assertWritable: true
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  const embeddingModel = modelHandle.getEmbeddingModelData(
    getDatasetModelReference(collection.dataset, 'embedding')
  );
  const { index, tokens } = await createDatasetDataIndex({
    data: datasetData,
    type,
    text,
    model: embeddingModel
  });

  if (tokens > 0) {
    pushGenerateVectorUsage({
      teamId,
      tmbId,
      inputTokens: tokens,
      model: embeddingModel
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
