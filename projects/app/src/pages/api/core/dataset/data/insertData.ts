/*
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { hasSameValue } from '@/service/core/dataset/data/utils';
import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
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

  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1 + (indexes?.length || 0)
  });

  const [
    {
      dataset: { _id: datasetId, vectorModelId, agentModelId },
      indexPrefixTitle,
      name
    }
  ] = await Promise.all([getCollectionWithDataset(collectionId)]);

  const formatQ = simpleText(q);
  const formatA = simpleText(a);
  const formatIndexes = indexes?.map((item) => ({
    ...item,
    text: simpleText(item.text)
  }));

  const vectorModelData = getEmbeddingModelById(vectorModelId);

  await hasSameValue({
    teamId,
    datasetId,
    collectionId,
    q: formatQ,
    a: formatA
  });

  const { insertId, tokens } = await insertData2Dataset({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q: formatQ,
    a: formatA,
    chunkIndex: 0,
    indexPrefix: indexPrefixTitle ? `# ${name}` : undefined,
    embeddingModelId: vectorModelData.id,
    indexes: formatIndexes
  });

  pushGenerateVectorUsage({
    teamId,
    tmbId,
    inputTokens: tokens,
    modelId: vectorModelData.id
  });

  (() => {
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
  })();

  return InsertDataResponseSchema.parse(insertId);
}

export default NextAPI(handler);
