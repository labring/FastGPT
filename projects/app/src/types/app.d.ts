import { FlowNodeTypeEnum, FlowNodeValTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { XYPosition } from 'reactflow';
import {
  AppModuleItemTypeEnum,
  AppTypeEnum,
  ModulesInputItemTypeEnum,
  VariableInputEnum
} from '../constants/app';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  FlowNodeOutputTargetItemType
} from '@fastgpt/global/core/module/node/type.d';
import type { FlowModuleTemplateType, ModuleItemType } from '@fastgpt/global/core/module/type.d';
import type { AppSchema, ChatSchema } from './mongoSchema';
import { ChatModelType } from '@/constants/model';

export type AppListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};

export type CreateAppParams = {
  name?: string;
  avatar?: string;
  type?: `${AppTypeEnum}`;
  modules: AppSchema['modules'];
};
export interface AppUpdateParams {
  name?: string;
  type?: `${AppTypeEnum}`;
  avatar?: string;
  intro?: string;
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
  type: `${FlowNodeValTypeEnum}`;
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
export type AppItemType = {
  id: string;
  name: string;
  modules: ModuleItemType[];
};

export type RunningModuleItemType = {
  name: ModuleItemType['name'];
  moduleId: ModuleItemType['moduleId'];
  flowType: ModuleItemType['flowType'];
  showStatus?: ModuleItemType['showStatus'];
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
