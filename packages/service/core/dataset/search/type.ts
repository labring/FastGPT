import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

export type SearchDatasetDataProps = {
  histories: ChatItemMiniType[];
  teamId: string;
  uid?: string;
  tmbId?: string;
  model: string;
  vlmModel?: string;
  datasetIds: string[];
  reRankQuery: string;
  // 工作流入口归一化后的文本 query。
  textQueries: string[];
  // 工作流入口归一化后的图片 query。
  imageQueries?: string[];
  // 外部 OpenAI 账号。默认召回里的辅助 LLM 请求需要沿用它来保持计费一致。
  userKey?: OpenaiAccountType;

  [NodeInputKeyEnum.datasetSimilarity]?: number; // min distance
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.datasetSearchMode]?: DatasetSearchModeEnum;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: RerankModelItemType;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  /*
    {
      tags: {
        $and: ["str1","str2"],
        $or: ["str1","str2",null] null means no tags
      },
      createTime: {
        $gte: 'xx',
        $lte: 'xxx'
      }
    }
  */
  collectionFilterMatch?: string;
};

export type SearchDatasetDataResponse = {
  searchRes: SearchDataResponseItemType[];
  embeddingTokens: number;
  reRankInputTokens: number;
  searchMode: `${DatasetSearchModeEnum}`;
  limit: number;
  similarity: number;
  usingReRank: boolean;
  usingSimilarityFilter: boolean;

  queryExtensionResult?: {
    llmModel: string;
    embeddingModel: string;
    requestId: string;
    seconds: number;
    inputTokens: number;
    outputTokens: number;
    usedUserOpenAIKey: boolean;
    embeddingTokens: number;
    query: string;
  };
  deepSearchResult?: { model: string; inputTokens: number; outputTokens: number };
  imageCaptionResult?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    requestIds: string[];
    seconds: number;
    usedUserOpenAIKey: boolean;
    queries: string[];
  };
};

export type DefaultSearchDatasetDataProps = Omit<SearchDatasetDataProps, 'reRankQuery'> & {
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  userKey?: OpenaiAccountType;
};

export type DeepRagSearchProps = Omit<SearchDatasetDataProps, 'reRankQuery'> & {
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
};
