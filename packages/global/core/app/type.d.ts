import type { FlowNodeTemplateType, StoreNodeItemType } from '../workflow/type/node';
import type { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';
import type {
  ContentTypes,
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '../workflow/constants';
import type { InputComponentPropsType, SelectedDatasetType } from '../workflow/type/io';
import type { DatasetSearchModeEnum } from '../dataset/constants';
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import type { StoreEdgeItemType } from '../workflow/type/edge';
import type { AppPermission } from '../../support/permission/app/controller';
import type { ParentIdType } from '../../common/parentFolder/type';
import { FlowNodeInputTypeEnum } from '../../core/workflow/node/constant';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import type { SourceMemberType } from '../../support/user/type';
import type { JSONSchemaInputType, JSONSchemaOutputType } from './jsonschema';

export type AppSchema = {
  _id: string;
  parentId?: ParentIdType;
  teamId: string;
  tmbId: string;
  type: AppTypeEnum;
  version?: 'v1' | 'v2';

  name: string;
  avatar: string;
  intro: string;
  templateId?: string; // Create by template

  updateTime: Date;

  modules: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  pluginData?: {
    nodeVersion?: string;
    pluginUniId?: string; // plugin unique id(plugin name)
    apiSchemaStr?: string; // api schema string
    customHeaders?: string;
  };

  // App system config
  chatConfig: AppChatConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType | null;
  scheduledTriggerNextTime?: Date;

  inheritPermission?: boolean;

  // if access the app by favourite or quick
  favourite?: boolean;
  quick?: boolean;

  /** @deprecated */
  defaultPermission?: number;
  /** @deprecated */
  inited?: boolean;
  /** @deprecated */
  teamTags: string[];
};

export type AppListItemType = {
  _id: string;
  parentId: ParentIdType;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  type: AppTypeEnum;
  updateTime: Date;
  pluginData?: AppSchema['pluginData'];
  permission: AppPermission;
  inheritPermission?: boolean;
  private?: boolean;
  sourceMember: SourceMemberType;
  hasInteractiveNode?: boolean;
};

export type AppDetailType = AppSchema & {
  permission: AppPermission;
};

export type AppDatasetSearchParamsType = {
  searchMode: `${DatasetSearchModeEnum}`;
  limit?: number; // limit max tokens
  similarity?: number;
  embeddingWeight?: number; // embedding weight, fullText weight = 1 - embeddingWeight

  usingReRank?: boolean;
  rerankModel?: string;
  rerankWeight?: number;

  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;
};
export type AppSimpleEditFormType = {
  // templateId: string;
  aiSettings: {
    [NodeInputKeyEnum.aiModel]: string;
    [NodeInputKeyEnum.aiSystemPrompt]?: string | undefined;
    [NodeInputKeyEnum.aiChatTemperature]?: number;
    [NodeInputKeyEnum.aiChatMaxToken]?: number;
    [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
    maxHistories: number;
    [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
    [NodeInputKeyEnum.aiChatTopP]?: number;
    [NodeInputKeyEnum.aiChatStopSign]?: string;
    [NodeInputKeyEnum.aiChatResponseFormat]?: string;
    [NodeInputKeyEnum.aiChatJsonSchema]?: string;
  };
  dataset: {
    datasets: SelectedDatasetType[];
  } & AppDatasetSearchParamsType;
  selectedTools: FlowNodeTemplateType[];
  chatConfig: AppChatConfigType;
};

export type HttpToolConfigType = {
  name: string;
  description: string;
  inputSchema: JSONSchemaInputType;
  outputSchema: JSONSchemaOutputType;
  path: string;
  method: string;

  // manual
  staticParams?: Array<{ key: string; value: string }>;
  staticHeaders?: Array<{ key: string; value: string }>;
  staticBody?: {
    type: ContentTypes;
    content?: string;
    formData?: Array<{ key: string; value: string }>;
  };
  headerSecret?: StoreSecretValueType;
};

/* app chat config type */
export type AppChatConfigType = {
  welcomeText?: string;
  variables?: VariableItemType[];
  autoExecute?: AppAutoExecuteConfigType;
  questionGuide?: AppQGConfigType;
  ttsConfig?: AppTTSConfigType;
  whisperConfig?: AppWhisperConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType;
  chatInputGuide?: ChatInputGuideConfigType;
  fileSelectConfig?: AppFileSelectConfigType;

  // plugin
  instruction?: string;
};
export type SettingAIDataType = {
  model: string;
  temperature?: number;
  maxToken?: number;
  isResponseAnswerText?: boolean;
  maxHistories?: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean; // Is open vision mode
  [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;
};

// variable
export type VariableItemType = AppFileSelectConfigType &
  InputComponentPropsType & {
    type: VariableInputEnum;
    description: string;
  };
// tts
export type AppTTSConfigType = {
  type: 'none' | 'web' | 'model';
  model?: string;
  voice?: string;
  speed?: number;
};
// whisper
export type AppWhisperConfigType = {
  open: boolean;
  autoSend: boolean;
  autoTTSResponse: boolean;
};

// question guide
export type AppQGConfigType = {
  open: boolean;
  model?: string;
  customPrompt?: string;
};

// question guide text
export type ChatInputGuideConfigType = {
  open: boolean;
  customUrl: string;
};
// interval timer
export type AppScheduledTriggerConfigType = {
  cronString: string;
  timezone: string;
  defaultPrompt: string;
};
// auto execute
export type AppAutoExecuteConfigType = {
  open: boolean;
  defaultPrompt: string;
};
// File
export type AppFileSelectConfigType = {
  maxFiles?: number;
  canSelectFile?: boolean;
  customPdfParse?: boolean;
  canSelectImg?: boolean;
  canSelectVideo?: boolean;
  canSelectAudio?: boolean;
  canSelectCustomFileExtension?: boolean;
  customFileExtensionList?: string[];
};

export type AppTemplateSchemaType = {
  templateId: string;
  name: string;
  intro: string;
  avatar: string;
  tags: string[];
  type: string;
  author?: string;
  isActive?: boolean;
  isPromoted?: boolean;
  recommendText?: string;
  userGuide?: {
    type: 'markdown' | 'link';
    content?: string;
    link?: string;
  };
  isQuickTemplate?: boolean;
  order?: number;
  // TODO: 对于建议应用，是另一个格式
  workflow: WorkflowTemplateBasicType;
};

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};
