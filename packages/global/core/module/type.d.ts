import { FlowNodeTypeEnum } from './node/constant';
import { ModuleDataTypeEnum, ModuleTemplateTypeEnum, VariableInputEnum } from './constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';

export type FlowModuleTemplateType = {
  id: string;
  templateType: `${ModuleTemplateTypeEnum}`;
  flowType: `${FlowNodeTypeEnum}`; // unique
  avatar?: string;
  name: string;
  intro: string; // template list intro
  showStatus?: boolean; // chatting response step status
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};
export type FlowModuleItemType = FlowModuleTemplateType & {
  moduleId: string;
};
export type moduleTemplateListType = {
  type: `${ModuleTemplateTypeEnum}`;
  label: string;
  list: FlowModuleTemplateType[];
}[];

// store module type
export type ModuleItemType = {
  name: string;
  avatar?: string;
  intro?: string;
  moduleId: string;
  position?: {
    x: number;
    y: number;
  };
  flowType: `${FlowNodeTypeEnum}`;
  showStatus?: boolean;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};

/* function type */
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

export type SelectAppItemType = {
  id: string;
  name: string;
  logo: string;
};

/* agent */
export type ClassifyQuestionAgentItemType = {
  value: string;
  key: string;
};
export type ContextExtractAgentItemType = {
  desc: string;
  key: string;
  required: boolean;
};
