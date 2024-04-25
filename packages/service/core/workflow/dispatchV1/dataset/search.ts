// @ts-nocheck
import {
  DispatchNodeResponseType,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type.d';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/api.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { ModelTypeEnum, getLLMModel, getVectorModel } from '../../../ai/model';
import { searchDatasetData } from '../../../dataset/search/controller';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getHistories } from '../utils';
import { datasetSearchQueryExtension } from '../../../dataset/search/utils';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { checkTeamReRankPermission } from '../../../../support/permission/teamLimit';

type DatasetSearchProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;
}>;
export type DatasetSearchResponse = DispatchNodeResultType<{
  isEmpty?: boolean;
  unEmpty?: boolean;
  [NodeOutputKeyEnum.datasetQuoteQA]: SearchDataResponseItemType[];
}>;

export async function dispatchDatasetSearch(
  props: DatasetSearchProps
): Promise<DatasetSearchResponse> {
  const {
    teamId,
    histories,
    module,
    params: {
      datasets = [],
      similarity,
      limit = 1500,
      usingReRank,
      searchMode,
      userChatInput,

      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel,
      datasetSearchExtensionBg
    }
  } = props as DatasetSearchProps;

  if (!Array.isArray(datasets)) {
    return Promise.reject('Quote type error');
  }

  if (datasets.length === 0) {
    return Promise.reject('core.chat.error.Select dataset empty');
  }

  if (!userChatInput) {
    return Promise.reject('core.chat.error.User input empty');
  }

  // query extension
  const extensionModel =
    datasetSearchUsingExtensionQuery && datasetSearchExtensionModel
      ? getLLMModel(datasetSearchExtensionModel)
      : undefined;
  const { concatQueries, rewriteQuery, aiExtensionResult } = await datasetSearchQueryExtension({
    query: userChatInput,
    extensionModel,
    extensionBg: datasetSearchExtensionBg,
    histories: getHistories(6, histories)
  });

  // console.log(concatQueries, rewriteQuery, aiExtensionResult);

  // get vector
  const vectorModel = getVectorModel(datasets[0]?.vectorModel?.model);

  // start search
  const {
    searchRes,
    tokens,
    usingSimilarityFilter,
    usingReRank: searchUsingReRank
  } = await searchDatasetData({
    teamId,
    reRankQuery: `${rewriteQuery}`,
    queries: concatQueries,
    model: vectorModel.model,
    similarity,
    limit,
    datasetIds: datasets.map((item) => item.datasetId),
    searchMode,
    usingReRank: usingReRank && (await checkTeamReRankPermission(teamId))
  });

  // count bill results
  // vector
  const { totalPoints, modelName } = formatModelChars2Points({
    model: vectorModel.model,
    tokens,
    modelType: ModelTypeEnum.vector
  });
  const responseData: DispatchNodeResponseType & { totalPoints: number } = {
    totalPoints,
    query: concatQueries.join('\n'),
    model: modelName,
    tokens,
    similarity: usingSimilarityFilter ? similarity : undefined,
    limit,
    searchMode,
    searchUsingReRank: searchUsingReRank,
    quoteList: searchRes
  };
  const nodeDispatchUsages: ChatNodeUsageType[] = [
    {
      totalPoints,
      moduleName: module.name,
      model: modelName,
      tokens
    }
  ];

  if (aiExtensionResult) {
    const { totalPoints, modelName } = formatModelChars2Points({
      model: aiExtensionResult.model,
      tokens: aiExtensionResult.tokens,
      modelType: ModelTypeEnum.llm
    });

    responseData.totalPoints += totalPoints;
    responseData.tokens = aiExtensionResult.tokens;
    responseData.extensionModel = modelName;
    responseData.extensionResult =
      aiExtensionResult.extensionQueries?.join('\n') ||
      JSON.stringify(aiExtensionResult.extensionQueries);

    nodeDispatchUsages.push({
      totalPoints,
      moduleName: 'core.module.template.Query extension',
      model: modelName,
      tokens: aiExtensionResult.tokens
    });
  }

  return {
    isEmpty: searchRes.length === 0 ? true : undefined,
    unEmpty: searchRes.length > 0 ? true : undefined,
    quoteQA: searchRes,
    [DispatchNodeResponseKeyEnum.nodeResponse]: responseData,
    nodeDispatchUsages,
    [DispatchNodeResponseKeyEnum.toolResponses]: searchRes.map((item) => ({
      id: item.id,
      text: `${item.q}\n${item.a}`.trim()
    }))
  };
}
