/* 
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import type { NextApiRequest } from 'next';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { getEmbeddingModel, getLLMModel } from '@fastgpt/service/core/ai/model';
import { hasSameValue } from '@/service/core/dataset/data/utils';
import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import type { InsertOneDatasetDataProps } from '@/global/core/dataset/api';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: NextApiRequest) {
  const { collectionId, q, a, indexes } = req.body as InsertOneDatasetDataProps;

  if (!q) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

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
      dataset: { _id: datasetId, vectorModel, agentModel },
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

  const token = await countPromptTokens(formatQ + formatA, '');
  const vectorModelData = getEmbeddingModel(vectorModel);
  const llmModelData = getLLMModel(agentModel);
  const maxChunkSize = getLLMMaxChunkSize(llmModelData);

  if (token > maxChunkSize) {
    return Promise.reject(`Content over max chunk size: ${maxChunkSize}`);
  }

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
    embeddingModel: vectorModelData.model,
    indexes: formatIndexes
  });

  pushGenerateVectorUsage({
    teamId,
    tmbId,
    inputTokens: tokens,
    model: vectorModelData.model
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
  return insertId;
}

export default NextAPI(handler);
