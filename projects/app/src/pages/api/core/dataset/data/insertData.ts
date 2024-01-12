/* 
  insert one data to dataset (immediately insert)
  manual input or mark data
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { getVectorModel } from '@/service/core/ai/model';
import { hasSameValue } from '@/service/core/dataset/data/utils';
import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { getCollectionWithDataset } from '@fastgpt/service/core/dataset/controller';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';
import { InsertOneDatasetDataProps } from '@/global/core/dataset/api';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/limit/dataset';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { collectionId, q, a, indexes } = req.body as InsertOneDatasetDataProps;

    if (!q) {
      return Promise.reject('q is required');
    }

    if (!collectionId) {
      return Promise.reject('collectionId is required');
    }

    // 凭证校验
    const { teamId, tmbId } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId,
      per: 'w'
    });

    await checkDatasetLimit({
      teamId,
      freeSize: global.feConfigs?.subscription?.datasetStoreFreeSize,
      insertLen: 1
    });

    // auth collection and get dataset
    const [
      {
        datasetId: { _id: datasetId, vectorModel }
      }
    ] = await Promise.all([getCollectionWithDataset(collectionId), authTeamBalance(teamId)]);

    // format data
    const formatQ = simpleText(q);
    const formatA = simpleText(a);
    const formatIndexes = indexes?.map((item) => ({
      ...item,
      text: simpleText(item.text)
    }));

    // token check
    const token = countPromptTokens(formatQ, 'system');
    const vectorModelData = getVectorModel(vectorModel);

    if (token > vectorModelData.maxToken) {
      return Promise.reject('Q Over Tokens');
    }

    // Duplicate data check
    await hasSameValue({
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

    pushGenerateVectorBill({
      teamId,
      tmbId,
      tokens,
      model: vectorModelData.model
    });

    jsonRes<string>(res, {
      data: insertId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
