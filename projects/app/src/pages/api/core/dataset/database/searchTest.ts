import type { DatabaseSearchTestResponse } from '@/global/core/dataset/api';
import { NextAPI } from '@/service/middleware/entry';
import { pushGenerateSqlUsage, pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { getEmbeddingModel, getLLMModel } from '@fastgpt/service/core/ai/model';
import {
  generateAndExecuteSQL,
  SearchDatabaseData
} from '@fastgpt/service/core/dataset/search/controller';
import { calculateDynamicLimit } from '@fastgpt/service/core/dataset/search/utils';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { DatabaseSearchTestBody } from '@fastgpt/global/core/dataset/database/api';
import {
  getMetadataWithValueExamples,
  queryByNL,
  getDuckDBStoreConfig
} from '@fastgpt/service/core/dataset/database/dative/client/dativeApiServer';

async function handler(
  req: ApiRequestProps<DatabaseSearchTestBody, {}>
): Promise<DatabaseSearchTestResponse> {
  // 未选择model时使用默认模型
  const { datasetId, query, model } = req.body;

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
  const sqlLLM = getLLMModel(model);

  // Calculate dynamic limit based on generateSqlModel's maxContext
  const dynamicLimit = calculateDynamicLimit({
    generateSqlModel: model,
    safetyFactor: 0.6,
    estimatedTokensPerItem: 1024
  });

  addLog.debug('Dataset Search Test', {
    datasetId: datasetId,
    vectorModel: vectorModel,
    model: sqlLLM.model,
    name: sqlLLM.name,
    apikey: sqlLLM.requestAuth,
    baseurl: sqlLLM.requestUrl,
    calculatedDynamicLimit: dynamicLimit
  });
  const databaseSearch = async (): Promise<DatabaseSearchTestResponse> => {
    const { schema, tokens: embeddingTokens } = await SearchDatabaseData({
      histories: [],
      teamId: teamId,
      queries: [query],
      model: vectorModel.model,
      limit: dynamicLimit,
      datasetIds: [datasetId]
    });

    if (!schema) {
      return Promise.reject('Dataset Search - Database search failed');
    }

    const start = Date.now();
    const key = sqlLLM.requestAuth || undefined;
    const url = sqlLLM.requestUrl?.replace(/(chat\/completions.*)$/, '') || undefined;
    const generateSqlResult = await generateAndExecuteSQL({
      datasetId,
      query: query,
      schema: schema,
      teamId,
      limit: 50,
      generate_sql_llm: {
        model: sqlLLM.model,
        api_key: key,
        base_url: url
      },
      evaluate_sql_llm: {
        model: sqlLLM.model,
        api_key: key,
        base_url: url
      }
    });

    if (!generateSqlResult) {
      return Promise.reject('Dataset Search - SQL Generation Failed');
    }

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
      model: sqlLLM.model
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
      limit: dynamicLimit,
      searchMode: DatasetSearchModeEnum.database
    } as DatabaseSearchTestResponse;
  };
  const structureDocumentSearch = async (): Promise<DatabaseSearchTestResponse> => {
    const start = Date.now();

    // Get metadata for all files (with value examples)
    const metadata = await getMetadataWithValueExamples(getDuckDBStoreConfig(datasetId));

    addLog.debug('Structure Document Search - Metadata retrieved', {
      tableCount: metadata.tables?.length || 0
    });

    if (!metadata.tables || metadata.tables.length === 0) {
      return Promise.reject('No files found in this structure document dataset');
    }

    // Prepare SQL generation request
    const key = sqlLLM.requestAuth || undefined;
    const url = sqlLLM.requestUrl?.replace(/(chat\/completions.*)$/, '') || undefined;

    // Execute query by natural language
    const result = await queryByNL({
      source_config: getDuckDBStoreConfig(datasetId),
      generate_sql_llm: {
        model: sqlLLM.model,
        api_key: key,
        base_url: url
      },
      evaluate_sql_llm: {
        model: sqlLLM.model,
        api_key: key,
        base_url: url
      },
      query,
      result_num_limit: 50,
      retrieved_metadata: metadata
    });
    addLog.debug(JSON.stringify(result, null, 2));
    if (!result) {
      return Promise.reject('Structure Document Search - SQL Generation Failed');
    }

    // Record usage
    const { totalPoints: generateSqlTotalPoints } = pushGenerateSqlUsage({
      teamId,
      tmbId,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      model: sqlLLM.model
    });

    if (apikey) {
      updateApiKeyUsage({
        apikey,
        totalPoints: generateSqlTotalPoints
      });
    }

    // Add audit log
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
      answer: result.answer,
      sql_result: result.sql,
      duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
      limit: 50,
      searchMode: DatasetSearchModeEnum.database
    } as DatabaseSearchTestResponse;
  };

  // Execute search based on dataset type
  if (dataset.type === DatasetTypeEnum.database) {
    return await databaseSearch();
  }

  if (dataset.type === DatasetTypeEnum.structureDocument) {
    return await structureDocumentSearch();
  }

  return Promise.reject(`Unsupported dataset type: ${dataset.type}`);
}
export default NextAPI(handler);
