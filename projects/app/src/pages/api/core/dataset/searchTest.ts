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
import { getLLMModel } from '@/service/core/ai/model';
import { queryExtension } from '@fastgpt/service/core/ai/functions/queryExtension';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      datasetId,
      text,
      limit = 1500,
      similarity,
      searchMode,
      usingReRank,

      datasetSearchUsingExtensionQuery = false,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg = ''
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

    const extensionModel = getLLMModel(datasetSearchExtensionModel);

    // query extension
    const extensionResult = await (async () => {
      if (!datasetSearchUsingExtensionQuery) return;
      const result = await queryExtension({
        chatBg: datasetSearchExtensionBg,
        query: text,
        histories: [],
        model: extensionModel.model
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    })();

    const { concatQueries, rewriteQuery } = (() => {
      let queries = [text];
      let rewriteQuery = text;

      if (extensionResult) {
        queries = queries.concat(extensionResult.extensionQueries);
        rewriteQuery = queries.join('\n');
      }

      return {
        concatQueries: queries,
        rewriteQuery
      };
    })();

    const { searchRes, charsLength, ...result } = await searchDatasetData({
      teamId,
      reRankQuery: rewriteQuery,
      queries: concatQueries,
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
      charsLength,
      model: dataset.vectorModel,
      source: apikey ? BillSourceEnum.api : BillSourceEnum.fastgpt,

      ...(extensionResult && {
        extensionModel: extensionModel.name,
        extensionInputTokens: extensionResult.inputTokens,
        extensionOutputTokens: extensionResult.outputTokens
      })
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
