import { AppModuleItemTypeEnum, ModulesInputItemTypeEnum } from '../constants/app';

/* input item */
export type ModuleItemCommonType = {
  key: string; // 字段名
  formType: `${ModuleInputItemTypeEnum}`;
  label: string;
  description?: string;
  placeholder?: string;
  max?: number;
  min?: number;
  default?: any;
  enum?: { label: string; value: any }[];
};

export type ModuleItemOutputItemType = {
  key: string;
  targets: { moduleId: string; key: string }[];
};

export type ModuleItemType = {
  moduleId: string;
  avatar: string;
  name: string;
  description: string;
  url: string;
  body: ModuleItemCommonType[];
  inputs: ModuleItemCommonType[];
  outputs: ModuleItemOutputItemType[];
};

/* input item */
type FormItemCommonType = {
  key: string; // 字段名
  label: string;
  description: string;
  formType: `${ModulesInputItemTypeEnum}`;
};

/* agent */
/* question classify */
export type ClassifyQuestionAgentItemType = {
  desc: string;
  key: string;
};

/* app module */
export type AppModuleItemType = {
  moduleId: string;
  type: `${AppModuleItemTypeEnum}`;
  url?: string;
  body: Record<string, any>;
  inputs: { key: string; value: any }[];
  outputs: {
    key: string;
    value?: any;
    response?: boolean;
    answer?: boolean; // json response
    targets: {
      moduleId: string;
      key: string;
    }[];
  }[];
};

export type AppItemType = {
  id: string;
  modules: AppModuleItemType[];
};
