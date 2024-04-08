import type { FlowNodeTemplateType, ModuleItemType } from '../module/type.d';

import { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';
import type { DatasetModuleProps } from '../module/node/type.d';
import { VariableInputEnum } from '../module/constants';
import { SelectedDatasetType } from '../module/api';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
export interface AppSchema {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  name: string;
  type: `${AppTypeEnum}`;
  avatar: string;
  intro: string;
  updateTime: number;
  modules: ModuleItemType[];
  permission: `${PermissionTypeEnum}`;
  inited?: boolean;
  teamTags: string[];
}

export type AppListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
  isOwner: boolean;
  permission: `${PermissionTypeEnum}`;
};

export type AppDetailType = AppSchema & {
  isOwner: boolean;
  canWrite: boolean;
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
  userGuide: {
    welcomeText: string;
    variables: {
      id: string;
      key: string;
      label: string;
      type: `${VariableInputEnum}`;
      required: boolean;
      maxLen: number;
      enums: {
        value: string;
      }[];
    }[];
    questionGuide: boolean;
    tts: {
      type: 'none' | 'web' | 'model';
      model?: string | undefined;
      voice?: string | undefined;
      speed?: number | undefined;
    };
    whisper: AppWhisperConfigType;
  };
};

/* app function config */
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
