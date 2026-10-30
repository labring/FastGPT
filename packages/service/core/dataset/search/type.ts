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
import type { DatasetSearchParams } from '@fastgpt/global/core/dataset/search/type';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

export type DatasetSearchActor = { teamId: string; tmbId: string; isRoot: boolean };

/** 由可信调用方声明，不能从公开搜索请求中读取。 */
export type DatasetSearchCapabilities = { metadataFilter: boolean };

export type DatasetSearchDataset = Pick<
  DatasetSchemaType,
  '_id' | 'teamId' | 'name' | 'type' | 'vectorModelId' | 'vectorModel' | 'vlmModelId' | 'vlmModel'
>;

/** 搜索只使用解析后的模型，不依赖模型目录、缓存或权限实现。 */
export type DatasetSearchModels = {
  /** 与输入知识库保持相同顺序，每个知识库必须恰好对应一个模型。 */
  embeddings: EmbeddingModelDataType[];
  rerank?: RerankModelDataType;
  queryExtension?: LLMModelDataType;
  imageCaption?: LLMModelDataType;
};

/** 基础设施端口：实现必须遵守读取权限、图片归属及集合过滤约定。 */
export type DatasetSearchRuntime = {
  permissions: {
    loadReadableDataset: (props: {
      actor: DatasetSearchActor;
      datasetId: string;
    }) => Promise<DatasetSearchDataset>;
    resolveReadableCollectionIds: (props: {
      actor: DatasetSearchActor;
      datasetIds: string[];
    }) => Promise<string[] | undefined>;
  };
  resolveModels: (props: {
    actor: DatasetSearchActor;
    datasets: DatasetSearchDataset[];
    rerank: DatasetSearchParams['rerank'];
    queryExtension: DatasetSearchParams['queryExtension'];
  }) => Promise<DatasetSearchModels>;
  images: {
    isAuthorizedKey: (props: { key: string; teamId: string }) => boolean;
    createQueryUrl: (props: { key: string }) => Promise<string>;
  };
  recall: (props: DefaultSearchDatasetDataProps) => Promise<SearchDatasetDataResponse>;
};

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
  /** 入口按各自协议完成校验与默认值补齐，领域层不叠加新 HTTP 协议的范围约束。 */
  params: DatasetSearchParams;
  context: {
    actor: DatasetSearchActor;
    capabilities: DatasetSearchCapabilities;
    histories?: ChatItemMiniType[];
    userKey?: OpenaiAccountType;
  };
  deps: DatasetSearchRuntime & {
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

  /** 调用方显式声明元数据筛选能力，底层不读取商业版本全局开关。 */
  metadataFilterEnabled: boolean;

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
