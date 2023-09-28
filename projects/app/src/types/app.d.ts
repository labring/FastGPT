import { FlowModuleTypeEnum } from '@/constants/flow';
import { XYPosition } from 'reactflow';
import {
  AppModuleItemTypeEnum,
  AppTypeEnum,
  ModulesInputItemTypeEnum,
  VariableInputEnum
} from '../constants/app';
import type {
  FlowInputItemType,
  FlowOutputItemType,
  FlowOutputTargetItemType
} from '@/types/core/app/flow';
import type { AppSchema, ChatSchema, kbSchema } from './mongoSchema';
import { ChatModelType } from '@/constants/model';
import { FlowValueTypeEnum } from '@/constants/flow';

export type AppListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};

export interface AppUpdateParams {
  name?: string;
  type?: `${AppTypeEnum}`;
  avatar?: string;
  intro?: string;
  chat?: AppSchema['chat'];
  share?: AppSchema['share'];
  modules?: AppSchema['modules'];
}

export interface ShareAppItem {
  _id: string;
  avatar: string;
  name: string;
  intro: string;
  userId: string;
  share: AppSchema['share'];
  isCollection: boolean;
}

/* agent */
/* question classify */
export type ClassifyQuestionAgentItemType = {
  value: string;
  key: string;
};
export type ContextExtractAgentItemType = {
  desc: string;
  key: string;
  required: boolean;
};
export type HttpFieldItemType = {
  label: string;
  key: string;
  type: `${FlowValueTypeEnum}`;
};

export type VariableItemType = {
  id: string;
  key: string;
  label: string;
  type: `${VariableInputEnum}`;
  required: boolean;
  maxLen: number;
  enums: { value: string }[];
};

/* app module */
export type AppModuleItemType = {
  name: string;
  moduleId: string;
  position?: XYPosition;
  flowType: `${FlowModuleTypeEnum}`;
  showStatus?: boolean;
  inputs: FlowInputItemType[];
  outputs: FlowOutputItemType[];
};

export type AppItemType = {
  id: string;
  name: string;
  modules: AppModuleItemType[];
};

export type RunningModuleItemType = {
  name: AppModuleItemType['name'];
  moduleId: AppModuleItemType['moduleId'];
  flowType: AppModuleItemType['flowType'];
  showStatus?: AppModuleItemType['showStatus'];
} & {
  inputs: {
    key: string;
    value?: any;
  }[];
  outputs: {
    key: string;
    answer?: boolean;
    response?: boolean;
    value?: any;
    targets: {
      moduleId: string;
      key: string;
    }[];
  }[];
};

export type AppLogsListItemType = {
  id: string;
  source: ChatSchema['source'];
  time: Date;
  title: string;
  messageCount: number;
  feedbackCount: number;
  markCount: number;
};
