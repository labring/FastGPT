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
  login_method?: ['email' | 'phone']; // Attention: login method is different with oauth
  find_password_method?: ['email' | 'phone'];
  bind_notification_method?: ['email' | 'phone'];
  googleClientVerKey?: string;
  mcpServerProxyEndpoint?: string;
  chineseRedirectUrl?: string;
  botIframeUrl?: string;

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
  show_publish_wecom?: boolean;
  show_publish_offiaccount?: boolean;

  show_dataset_enhance?: boolean;
  show_batch_eval?: boolean;

  concatMd?: string;
  docUrl?: string;
  openAPIDocUrl?: string;
  submitPluginRequestUrl?: string;
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
  tokenWorkers: number; // token count max worker

  datasetParseMaxProcess: number;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  vlmMaxProcess: number;

  hnswEfSearch: number;
  hnswMaxScanTuples: number;

  oneapiUrl?: string;
  chatApiKey?: string;

  customPdfParse?: customPdfParseType;
};

export type customPdfParseType = {
  url?: string;
  key?: string;
  doc2xKey?: string;
  price?: number;
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
  functions: {
    sso: boolean;
    pay: boolean;
    customTemplates: boolean;
    datasetEnhance: boolean;
    batchEval: boolean;
  };
};
