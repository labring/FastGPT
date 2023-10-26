import { FlowNodeTypeEnum } from './node/constant';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';

export type FlowModuleTemplateType = {
  flowType: `${FlowNodeTypeEnum}`; // unique
  logo?: string;
  name: string;
  description?: string;
  intro?: string;
  showStatus?: boolean; // chatting response step status
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};
export type FlowModuleItemType = FlowModuleTemplateType & {
  moduleId: string;
};
export type SystemModuleTemplateType = {
  label: string;
  list: FlowModuleTemplateType[];
}[];

export type ModuleItemType = {
  name: string;
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

export type FlowModuleItemSchema = {
  _id: string;
  userId: string;
  name: string;
  avatar: string;
  intro: string;
  updateTime: Date;
  modules: ModuleItemType[];
};

/* function type */
export type SelectAppItemType = {
  id: string;
  name: string;
  logo: string;
};
