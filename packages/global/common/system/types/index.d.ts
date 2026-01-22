import type { SubPlanType } from '../../../support/wallet/sub/type';
import { StandSubPlanLevelMapType } from '../../../support/wallet/sub/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  EmbeddingModelItemType,
  AudioSpeechModels,
  STTModelType,
  RerankModelItemType
} from '../../../core/ai/model.d';
import { SubTypeEnum } from '../../../support/wallet/sub/constants';
import type { small2bigConfigType } from '../../../core/dataset/type';

export type NavbarItemType = {
  id: string;
  name: string;
  avatar: string;
  url: string;
  isActive: boolean;
};

export type ExternalProviderWorkflowVarType = {
  name: string;
  key: string;
  intro: string;
  isOpen: boolean;
  url?: string;
};

/* fastgpt main */
export type FastGPTConfigFileType = {
  feConfigs: FastGPTFeConfigsType;
  systemEnv: SystemEnvType;
  subPlans?: SubPlanType;

  // Abandon
  llmModels?: ChatModelItemType[];
  vectorModels?: EmbeddingModelItemType[];
  reRankModels?: RerankModelItemType[];
  audioSpeechModels?: TTSModelType[];
  whisperModel?: STTModelType;
};

export type FastGPTFeConfigsType = {
  show_workorder?: boolean;
  show_emptyChat?: boolean;
  isPlus?: boolean;
  hideChatCopyrightSetting?: boolean;
  register_method?: ['email' | 'phone' | 'sync'];
  login_method?: ['email' | 'phone']; // Attention: login method is diffrent with oauth
  find_password_method?: ['email' | 'phone'];
  bind_notification_method?: ['email' | 'phone'];
  googleClientVerKey?: string;
  mcpServerProxyEndpoint?: string;
  chineseRedirectUrl?: string;

  show_emptyChat?: boolean;
  show_appStore?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  show_team_chat?: boolean;
  show_compliance_copywriting?: boolean;
  show_aiproxy?: boolean;
  show_coupon?: boolean;
  concatMd?: string;

  show_dataset_feishu?: boolean;
  show_dataset_yuque?: boolean;
  show_publish_feishu?: boolean;
  show_publish_dingtalk?: boolean;
  show_publish_offiaccount?: boolean;

  show_dataset_enhance?: boolean;
  show_batch_eval?: boolean;

  concatMd?: string;
  docUrl?: string;
  openAPIDocUrl?: string;
  systemPluginCourseUrl?: string;
  appTemplateCourse?: string;
  customApiDomain?: string;
  customSharePageDomain?: string;

  systemTitle?: string;
  scripts?: { [key: string]: string }[];
  favicon?: string;

  sso?: {
    icon?: string;
    title?: string;
    url?: string;
    autoLogin?: boolean;
  };
  oauth?: {
    github?: string;
    google?: string;
    wechat?: string;
    microsoft?: {
      clientId?: string;
      tenantId?: string;
      customButton?: string;
    };
  };
  limit?: {
    exportDatasetLimitMinutes?: number;
    websiteSyncLimitMinuted?: number;
  };

  uploadFileMaxAmount?: number;
  uploadFileMaxSize?: number;
  evalFileMaxLines?: number;

  // Compute by systemEnv.customPdfParse
  showCustomPdfParse?: boolean;
  customPdfParsePrice?: number;

  lafEnv?: string;
  navbarItems?: NavbarItemType[];
  externalProviderWorkflowVariables?: ExternalProviderWorkflowVarType[];

  payConfig?: {
    wx?: boolean;
    alipay?: boolean;
    bank?: boolean;
  };
};

export type SystemEnvType = {
  openapiPrefix?: string;
  parseMaxProcess?: number;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  hypeMaxProcess?: number;
  vlmMaxProcess: number;
  tokenWorkers: number; // token count max worker

  hnswEfSearch: number;
  hnswMaxScanTuples: number;

  oneapiUrl?: string;
  chatApiKey?: string;

  customPdfParse?: customPdfParseType;

  // Evaluation configurations
  evalConfig?: EvaluationConfigType;

  // Training configurations
  trainConfig?: TrainingConfigType;

  // Correction search similarity threshold
  correctionSimilarityThreshold?: number;

  // FAQ search similarity threshold
  faqSimilarityThreshold?: number;

  // Assistant场景专用配置
  assistantRetrievalLimit?: number; // 检索结果数量限制
  assistantFinalResultLimit?: number; // 最终返回的检索结果数量限制

  // Hype index parameters
  hypeParams?: HypeParamsType;

  // Custom template import configuration
  customTemplateImport?: {
    modes?: Array<{
      name: string;
      enabled?: boolean;
      contentDetection?: {
        // Placeholder for content detection rules
        rules?: any[];
      };
      enhanceConfig?: {
        autoIndexes?: boolean;
        small2bigIndexes?: boolean;
        syntheticIndex?: boolean;
        hypeIndexes?: boolean;
        hypeIndexPrompt?: string;
        small2bigConfig?: small2bigConfigType;
        autoIndexesPrompt?: string;
        imageIndexPrompt?: string;
      };
    }>;
    defaultActivateMode?: string; // Name of default activate mode to use
  };

  // Custom file import configuration
  customFileImport?: CustomFileImportConfigType;

  // Custom link import configuration
  customLinkImport?: CustomLinkImportConfigType;

  // Pentomino auto index configuration
  enableStandaloneSummary?: boolean; // 是否启用独立摘要生成（Pentomino SummaryEnhancer）
  summaryMinLength?: number; // 独立摘要最小长度阈值（字符数），低于此长度不生成摘要，默认500（参考 Pentomino data_splitter_config.chunk_size）

  // Dataset SQL query result limit (default: 100)
  datasetSqlResultLimit?: number;
};

// 文件解析配置
export type CustomFileParseConfigType = {
  customPdfParse?: boolean; // PDF 增强解析
};

// 分块配置
export type CustomChunkConfigType = {
  trainingType?: 'chunk' | 'qa';
  chunkTriggerType?: 'minSize' | 'maxSize' | 'forceChunk';
  chunkTriggerMinSize?: number;
  chunkSettingMode?: 'auto' | 'custom';
  chunkSplitMode?: 'paragraph' | 'size' | 'char';
  paragraphChunkAIMode?: 'forbid' | 'auto' | 'force';
  paragraphChunkDeep?: number;
  paragraphChunkMinSize?: number;
  chunkSize?: number;
  chunkSplitter?: string;
  indexSize?: number;
};

// 增强配置
export type CustomEnhanceConfigType = {
  dataEnhanceCollectionName?: boolean;
  imageIndex?: boolean;
  autoIndexes?: boolean;
  hypeIndexes?: boolean;
  indexPrefixTitle?: boolean;
  small2bigIndexes?: boolean;
  syntheticIndex?: boolean;
  small2bigConfig?: small2bigConfigType;
};

// Prompt 配置
export type CustomPromptConfigType = {
  autoIndexesPrompt?: string;
  hypeIndexPrompt?: string;
  imageIndexPrompt?: string;
  qaPrompt?: string;
};

// 文件导入模式配置
export type CustomFileImportModeType = {
  name: string;
  enabled?: boolean;
  fileTypes?: string[]; // 适用的文件类型
  contentDetection?: {
    rules?: any[]; // 内容探测规则（预留）
  };
  parseConfig?: CustomFileParseConfigType;
  chunkConfig?: CustomChunkConfigType;
  enhanceConfig?: CustomEnhanceConfigType;
  promptConfig?: CustomPromptConfigType;
};

// 文件导入总配置
export type CustomFileImportConfigType = {
  defaultActivateMode?: string;
  modes?: CustomFileImportModeType[];
};

// 链接导入模式配置
export type CustomLinkImportModeType = {
  name: string;
  enabled?: boolean;
  contentDetection?: {
    rules?: any[];
  };
  parseConfig?: {
    webPageSelector?: string;
  };
  chunkConfig?: CustomChunkConfigType;
  enhanceConfig?: CustomEnhanceConfigType;
  promptConfig?: CustomPromptConfigType;
};

// 链接导入总配置
export type CustomLinkImportConfigType = {
  defaultActivateMode?: string;
  modes?: CustomLinkImportModeType[];
};

export type customPdfParseType = {
  url?: string;
  key?: string;
  timeout?: number;
  doc2xKey?: string;
  price?: number;
};

export type EvaluationConfigType = {
  taskConcurrency?: number;
  caseConcurrency?: number;
  caseMaxRetry?: number;
  caseResultThreshold?: number;
  summaryConcurrency?: number;
  dataQualityConcurrency?: number;
  datasetDataSynthesizeConcurrency?: number;
  datasetSmartGenerateConcurrency?: number;
  maxStalledCount?: number;
};

export type TrainingConfigType = {
  taskConcurrency?: number; // Training task worker concurrency
  dataGenerateConcurrency?: number; // Training data generation worker concurrency
  maxStalledCount?: number; // Max stalled count for BullMQ workers
};

export type HypeParamsType = {
  similarityThreshold: number; // use to judg semantic drift, CosineSimilarity(candicateQuery,top1Doc),top1Doc!=tarDoc
  maxDeltaScore: number; // use to judg semantic drift, Score(Top1Doc) - Score(tarDoc) must be lower than this value
  minDeltaScore: number; // use to judg semantic distinction,Score(tarDoc)- Score(nextDoc) must be lower than this value
  expectRank: number; // tarDoc ranking must higher than this value
  defaultScore: number; // Default score for non-retrieved targets with low top1 similarity (indicating that the candicate has a good dispersion/diversity)
  topK: number;
  rerank: boolean;
  min_rerank_threshold: number;
};

export type LicenseDataType = {
  startTime: string;
  expiredTime: string;
  company: string;
  description?: string; // 描述
  hosts?: string[]; // 管理端有效域名
  maxUsers?: number; // 最大用户数，不填默认不上限
  maxApps?: number; // 最大应用数，不填默认不上限
  maxDatasets?: number; // 最大数据集数，不填默认不上限
  maxEvaluationTaskAmount?: number; // 最大评估任务数，不填默认不上限
  maxEvalDatasetAmount?: number; // 最大评估数据集数，不填默认不上限
  maxEvalDatasetDataAmount?: number; // 最大评估数据集数据量，不填默认不上限
  maxEvalMetricAmount?: number; // 最大评估指标数，不填默认不上限
  functions: {
    sso: boolean;
    pay: boolean;
    customTemplates: boolean;
    datasetEnhance: boolean;
    batchEval: boolean;
  };
};
