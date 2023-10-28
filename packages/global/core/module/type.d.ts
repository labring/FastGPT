import { FlowNodeTypeEnum } from './node/constant';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';

export type FlowModuleTemplateType = {
  id: string;
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
  logo?: string;
  intro?: string;
  description?: string;
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
export type SelectAppItemType = {
  id: string;
  name: string;
  logo: string;
};
