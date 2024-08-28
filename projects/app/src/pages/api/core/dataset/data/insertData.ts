/* 
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import type { NextApiRequest } from 'next';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import { hasSameValue } from '@/service/core/dataset/data/utils';
import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { InsertOneDatasetDataProps } from '@/global/core/dataset/api';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { collectionId, q, a, indexes } = req.body as InsertOneDatasetDataProps;

  if (!q) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  if (!collectionId) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  await checkDatasetLimit({
    teamId,
    insertLen: 1
  });

  // auth collection and get dataset
  const [
    {
      datasetId: { _id: datasetId, vectorModel }
    }
  ] = await Promise.all([getCollectionWithDataset(collectionId)]);

  // format data
  const formatQ = simpleText(q);
  const formatA = simpleText(a);
  const formatIndexes = indexes?.map((item) => ({
    ...item,
    text: simpleText(item.text)
  }));

  // token check
  const token = await countPromptTokens(formatQ + formatA, '');
  const vectorModelData = getVectorModel(vectorModel);

  if (token > vectorModelData.maxToken) {
    return Promise.reject('Q Over Tokens');
  }

  // Duplicate data check
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
    model: vectorModelData.model,
    indexes: formatIndexes
  });

  pushGenerateVectorUsage({
    teamId,
    tmbId,
    tokens,
    model: vectorModelData.model
  });

  return insertId;
}

export default NextAPI(handler);
