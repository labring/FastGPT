import { FlowModuleTypeEnum } from '@/constants/flow';
import { XYPosition } from 'reactflow';
import { AppModuleItemTypeEnum, ModulesInputItemTypeEnum } from '../constants/app';
import type { FlowInputItemType, FlowOutputItemType } from './flow';

/* agent */
/* question classify */
export type ClassifyQuestionAgentItemType = {
  desc: string;
  key: string;
};

/* app module */
export type AppModuleTemplateItemType = {
  logo?: string;
  name?: string;
  intro?: string;

  flowType: `${FlowModuleTypeEnum}`;
  type: `${AppModuleItemTypeEnum}`;
  url?: string;
  inputs: FlowInputItemType[];
  outputs: FlowOutputItemType[];
};
export type AppModuleItemType = AppModuleTemplateItemType & {
  moduleId: string;
  position?: XYPosition;
};

export type AppItemType = {
  id: string;
  name: string;
  modules: AppModuleItemType[];
};

export type RunningModuleItemType = {
  moduleId: string;
  type: `${AppModuleItemTypeEnum}`;
  url?: string;
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
