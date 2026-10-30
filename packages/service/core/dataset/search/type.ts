import type {
  EmbeddingModelDataType,
  LLMModelDataType,
  RerankModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { DatasetSearchInput } from '@fastgpt/global/core/dataset/search/type';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { ModelHandle } from '../../ai/model/catalog/handle';

export type DatasetSearchUsage = {
  items: Array<{
    phase: 'embedding' | 'rerank' | 'queryExtension' | 'queryExtensionEmbedding' | 'imageCaption';
    model: AIModelDataType;
    inputTokens: number;
    outputTokens: number;
    usedUserOpenAIKey: boolean;
  }>;
};

export type DatasetSearchEvent = {
  datasets: Pick<DatasetSchemaType, '_id' | 'name' | 'type'>[];
  resultCount: number;
  durationMs: number;
};

export type DatasetSearchProps = {
  params: DatasetSearchInput;
  context: {
    actor: { teamId: string; tmbId: string; isRoot: boolean };
    histories?: ChatItemMiniType[];
    userKey?: OpenaiAccountType;
  };
  deps: {
    getModelHandle: (props: { teamId: string }) => Promise<ModelHandle>;
    beforeSearch: () => Promise<void>;
    onUsage: (usage: DatasetSearchUsage) => Promise<void>;
    onSearched?: (event: DatasetSearchEvent) => Promise<void>;
  };
};

export type SearchDatasetDataProps = {
  histories: ChatItemMiniType[];
  teamId: string;
  uid?: string;
  tmbId?: string;
  model: EmbeddingModelDataType;
  vlmModel?: LLMModelDataType;
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
  [NodeInputKeyEnum.datasetSearchRerankModel]?: RerankModelDataType;
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

  // Collection 级权限可读 file collection ID 列表（检索权限过滤）。
  // undefined = 无需 collection 级过滤（短路 / 全部可读）；空数组 = 无可读集合（直接空结果）。
  // 由检索入口经 resolveReadableCollectionIds 解析后传入，与 metadata 过滤条件取交集。
  readableCollectionIdList?: string[];
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

  /** 重排前的文本召回候选集快照，仅用于日志详情对比召回与重排。
   *  取自重排前的 textRecallResults（不含图片侧召回），仅在启用重排且
   *  RETRIEVAL_RESULTS_LIMIT > 0 时产出。 */
  retrievalResults?: SearchDataResponseItemType[];

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
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: LLMModelDataType;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  userKey?: OpenaiAccountType;
};
