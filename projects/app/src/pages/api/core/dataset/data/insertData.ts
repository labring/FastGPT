/*
  insert one data to dataset
  manual input or mark data
*/
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { hasSameValue } from '@/service/core/dataset/data/utils';
import {
  getEmbeddingModelById,
  getLLMModelById,
  getVlmModelById
} from '@fastgpt/service/core/ai/model';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  InsertDataBodySchema,
  InsertDataResponseSchema,
  type InsertDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { createDataDraft } from '@fastgpt/service/core/dataset/data/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

async function handler(req: ApiRequestProps): Promise<InsertDataResponse> {
  const { collectionId, q, a, indexes } = InsertDataBodySchema.parse(req.body);

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  const mode = getTrainingModeByCollection(collection);

  await checkDatasetIndexLimit({
    teamId,
    insertLen: predictDataLimitLength(mode, [{ q, a }])
  });

  const {
    dataset: { _id: datasetId, vectorModelId, agentModelId, vlmModelId }
  } = await getCollectionWithDataset(collectionId);

  const formatQ = simpleText(q);
  const formatA = simpleText(a);
  const formatIndexes = indexes?.map((item) => ({
    ...item,
    text: simpleText(item.text)
  }));

  await hasSameValue({
    teamId,
    datasetId,
    collectionId,
    q: formatQ,
    a: formatA
  });

  return mongoSessionRun(async (session) => {
    const { usageId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: collection.name,
      billSource: UsageSourceEnum.training,
      vectorModelId: getEmbeddingModelById(vectorModelId)?.id,
      agentModelId: getLLMModelById(agentModelId)?.id,
      vlmModelId: getVlmModelById(vlmModelId)?.id,
      session
    });

    // Pre-create Data draft so Training carries dataId → generateVector uses UPDATE path
    const { _id: dataId } = await createDataDraft({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: formatQ,
      a: formatA,
      chunkIndex: 0,
      metadata: indexes?.length ? { customIndexes: true } : undefined,
      session
    });

    await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      mode,
      agentModelId,
      vectorModelId,
      vlmModelId,
      billId: usageId,
      data: [
        {
          id: String(dataId),
          q: formatQ,
          a: formatA,
          chunkIndex: 0,
          indexes: formatIndexes
        }
      ],
      session
    });

    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_DATA,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });

    return InsertDataResponseSchema.parse(dataId);
  });
}

export default NextAPI(handler);
