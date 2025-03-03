import { StandSubPlanLevelMapType, SubPlanType } from '../../../support/wallet/sub/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  EmbeddingModelItemType,
  AudioSpeechModels,
  STTModelType,
  ReRankModelItemType
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
  reRankModels?: ReRankModelItemType[];
  audioSpeechModels?: TTSModelType[];
  whisperModel?: STTModelType;
};

export type FastGPTFeConfigsType = {
  show_workorder?: boolean;
  show_emptyChat?: boolean;
  isPlus?: boolean;
  register_method?: ['email' | 'phone' | 'sync'];
  login_method?: ['email' | 'phone']; // Attention: login method is diffrent with oauth
  find_password_method?: ['email' | 'phone'];
  bind_notification_method?: ['email' | 'phone'];
  googleClientVerKey?: string;

  show_emptyChat?: boolean;
  show_appStore?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  show_team_chat?: boolean;
  show_compliance_copywriting?: boolean;
  show_aiproxy?: boolean;
  concatMd?: string;

  concatMd?: string;
  docUrl?: string;
  openAPIDocUrl?: string;
  systemPluginCourseUrl?: string;
  appTemplateCourse?: string;
  customApiDomain?: string;
  customSharePageDomain?: string;

  systemTitle?: string;
  systemDescription?: string;
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
    dingtalk?: string;
    wecom?: {
      corpid?: string;
      agentid?: string;
    };
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

  // Compute by systemEnv.customPdfParse
  showCustomPdfParse?: boolean;
  customPdfParsePrice?: number;

  lafEnv?: string;
  navbarItems?: NavbarItemType[];
  externalProviderWorkflowVariables?: ExternalProviderWorkflowVarType[];
};

export type SystemEnvType = {
  openapiPrefix?: string;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  vlmMaxProcess: number;
  pgHNSWEfSearch: number;
  tokenWorkers: number; // token count max worker

  oneapiUrl?: string;
  chatApiKey?: string;

  customPdfParse?: {
    url?: string;
    key?: string;

    doc2xKey?: string;
    price?: number; // n points/1 page
  };
};
