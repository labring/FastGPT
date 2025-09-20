import type { DatabaseSearchTestResponse } from '@/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { pushGenerateSqlUsage, pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { getDefaultLLMModel, getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import {
  generateAndExecuteSQL,
  SearchDatabaseData
} from '@fastgpt/service/core/dataset/search/controller';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

export type DatabaseSearchTestQuery = {
  datasetId: string;
};

export type DatabaseSearchTestBody = {
  query: string;
  model?: string;
};

async function handler(
  req: ApiRequestProps<DatabaseSearchTestBody, DatabaseSearchTestQuery>
): Promise<DatabaseSearchTestResponse> {
  const { datasetId } = req.query;

  // 未选择model时使用默认模型
  const { query, model = getDefaultLLMModel().name } = req.body;

  // auth dataset role
  const { dataset, teamId, tmbId, apikey } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // auth balance
  await checkTeamAIPoints(teamId);
  const vectorModel = getEmbeddingModel(dataset.vectorModel);

  addLog.debug('Dataset Search Test', {
    datasetId: datasetId,
    vectorModel: vectorModel
  });

  const { schema, tokens: embeddingTokens } = await SearchDatabaseData({
    histories: [],
    teamId: teamId,
    queries: [query],
    model: vectorModel.model,
    limit: 50,
    datasetIds: [datasetId]
  });
  if (schema) {
    addLog.info('Dataset Search - Database Search Result', {
      datasetId,
      tokens: embeddingTokens,
      schemaTables: Object.keys(schema).length
    });
    const start = Date.now();
    const generateSqlResult = await generateAndExecuteSQL({
      datasetId,
      query: query,
      schema: schema,
      teamId,
      limit: 50,
      generate_sql_llm: { model: model ?? getDefaultLLMModel().name },
      evaluate_sql_llm: { model: model ?? getDefaultLLMModel().name }
    });
    if (generateSqlResult) {
      addLog.info('Dataset Search - SQL Generation Success', {
        datasetId,
        sql: generateSqlResult.sql.substring(0, 100) + '...',
        dataCount: generateSqlResult.sql_res.data.length,
        inputTokens: generateSqlResult.input_tokens,
        outputTokens: generateSqlResult.output_tokens
      });
      const source = apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt;
      const { totalPoints: embeddingTotalPoints } = pushGenerateVectorUsage({
        teamId,
        tmbId,
        inputTokens: embeddingTokens,
        model: dataset.vectorModel,
        source
      });
      const { totalPoints: generateSqlTotalPoints } = pushGenerateSqlUsage({
        teamId,
        tmbId,
        inputTokens: generateSqlResult.input_tokens,
        outputTokens: generateSqlResult.output_tokens,
        model: model
      });

      if (apikey) {
        updateApiKeyUsage({
          apikey,
          totalPoints: embeddingTotalPoints + generateSqlTotalPoints
        });
      }
      (async () => {
        addAuditLog({
          tmbId,
          teamId,
          event: AuditEventEnum.SEARCH_TEST,
          params: {
            datasetName: dataset.name,
            datasetType: getI18nDatasetType(dataset.type)
          }
        });
      })();

      return {
        answer: generateSqlResult.answer,
        sql_result: generateSqlResult.sql,
        duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
        limit: 50,
        searchMode: DatasetSearchModeEnum.database
      } as DatabaseSearchTestResponse;
    } else {
      return Promise.reject('Dataset Search - SQL Generation Failed');
    }
  } else {
    return Promise.reject('Dataset Search - Database search failed');
  }
}
export default NextAPI(handler);
