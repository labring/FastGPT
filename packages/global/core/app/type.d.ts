import type { FlowNodeTemplateType, StoreNodeItemType } from '../workflow/type';
import { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { VariableInputEnum } from '../workflow/constants';
import { SelectedDatasetType } from '../workflow/api';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import { StoreEdgeItemType } from '../workflow/type/edge';
import { PermissionValueType } from '../../support/permission/type';
import { AppPermission } from '../../support/permission/app/controller';
import { ParentIdType } from '../../common/parentFolder/type';

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

  inited?: boolean;
  teamTags: string[];
  defaultPermission: PermissionValueType;
};

export type AppListItemType = {
  _id: string;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  type: AppTypeEnum;
  updateTime: Date;
  defaultPermission: PermissionValueType;
  permission: AppPermission;
  pluginData?: AppSchema['pluginData'];
};

export type AppDetailType = AppSchema & {
  permission: AppPermission;
};

export type AppSimpleEditFormType = {
  // templateId: string;
  aiSettings: {
    model: string;
    systemPrompt?: string | undefined;
    temperature: number;
    maxToken: number;
    isResponseAnswerText: boolean;
    maxHistories: number;
  };
  dataset: {
    datasets: SelectedDatasetType;
    searchMode: `${DatasetSearchModeEnum}`;
    similarity?: number;
    limit?: number;
    usingReRank?: boolean;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
  selectedTools: FlowNodeTemplateType[];
  chatConfig: AppChatConfigType;
};

/* app chat config type */
export type AppChatConfigType = {
  welcomeText?: string;
  variables?: VariableItemType[];
  questionGuide?: boolean;
  ttsConfig?: AppTTSConfigType;
  whisperConfig?: AppWhisperConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType;
  chatInputGuide?: ChatInputGuideConfigType;
};
export type SettingAIDataType = {
  model: string;
  temperature: number;
  maxToken: number;
  isResponseAnswerText?: boolean;
  maxHistories?: number;
};

// variable
export type VariableItemType = {
  id: string;
  key: string;
  label: string;
  type: `${VariableInputEnum}`;
  required: boolean;
  maxLen: number;
  enums: { value: string }[];
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
