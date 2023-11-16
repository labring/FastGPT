import { FlowNodeTypeEnum, FlowNodeValTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { XYPosition } from 'reactflow';
import {
  AppModuleItemTypeEnum,
  ModulesInputItemTypeEnum,
  VariableInputEnum
} from '../constants/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  FlowNodeOutputTargetItemType
} from '@fastgpt/global/core/module/node/type.d';
import type { FlowModuleTemplateType, ModuleItemType } from '@fastgpt/global/core/module/type.d';
import type { ChatSchema } from '@fastgpt/global/core/chat/type';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { ChatModelType } from '@/constants/model';

export interface ShareAppItem {
  _id: string;
  avatar: string;
  name: string;
  intro: string;
  userId: string;
  share: AppSchema['share'];
  isCollection: boolean;
}

export type VariableItemType = {
  id: string;
  key: string;
  label: string;
  type: `${VariableInputEnum}`;
  required: boolean;
  maxLen: number;
  enums: { value: string }[];
};

export type AppTTSConfigType = {
  type: 'none' | 'web' | 'model';
  model?: string;
  voice?: string;
  speed?: number;
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
  _id: string;
  id: string;
  source: ChatSchema['source'];
  time: Date;
  title: string;
  messageCount: number;
  feedbackCount: number;
  markCount: number;
};
