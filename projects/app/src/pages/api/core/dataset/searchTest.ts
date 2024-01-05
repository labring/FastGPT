import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import type { SearchTestProps, SearchTestResponse } from '@/global/core/dataset/api.d';
import { connectToDatabase } from '@/service/mongo';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';
import { searchDatasetData } from '@/service/core/dataset/data/controller';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { searchQueryExtension } from '@fastgpt/service/core/ai/functions/queryExtension';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      datasetId,
      text,
      limit = 1500,
      similarity,
      searchMode,
      usingReRank
    } = req.body as SearchTestProps;

    if (!datasetId || !text) {
      throw new Error('缺少参数');
    }

    const start = Date.now();

    // auth dataset role
    const { dataset, teamId, tmbId, apikey } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'r'
    });

    // auth balance
    await authTeamBalance(teamId);

    // query extension
    // const { queries } = await searchQueryExtension({
    //   query: text,
    //   model: global.chatModels[0].model
    // });

    const { searchRes, tokens, ...result } = await searchDatasetData({
      rawQuery: text,
      queries: [text],
      model: dataset.vectorModel,
      limit: Math.min(limit, 20000),
      similarity,
      datasetIds: [datasetId],
      searchMode,
      usingReRank
    });

    // push bill
    const { total } = pushGenerateVectorBill({
      teamId,
      tmbId,
      tokens,
      model: dataset.vectorModel,
      source: apikey ? BillSourceEnum.api : BillSourceEnum.fastgpt
    });
    if (apikey) {
      updateApiKeyUsage({
        apikey,
        usage: total
      });
    }

    jsonRes<SearchTestResponse>(res, {
      data: {
        list: searchRes,
        duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
        ...result
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
