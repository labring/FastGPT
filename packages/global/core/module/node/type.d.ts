import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeValTypeEnum,
  FlowNodeTypeEnum
} from './constant';

export type FlowNodeChangeProps = {
  moduleId: string;
  type: 'attr' | 'inputs' | 'outputs' | 'addInput' | 'delInput';
  key: string;
  value: any;
};

export type FlowNodeInputItemType = {
  key: string; // 字段名
  value?: any;
  valueType?: `${FlowNodeValTypeEnum}`;
  type: `${FlowNodeInputTypeEnum}`;
  label: string;
  edit?: boolean;
  connected?: boolean;
  description?: string;
  placeholder?: string;
  max?: number;
  min?: number;
  step?: number;
  required?: boolean;
  list?: { label: string; value: any }[];
  markList?: { label: string; value: any }[];
  customData?: () => any;
  valueCheck?: (value: any) => boolean;
};

export type FlowNodeOutputTargetItemType = {
  moduleId: string;
  key: string;
};
export type FlowNodeOutputItemType = {
  key: string; // 字段名
  label?: string;
  edit?: boolean;
  description?: string;
  valueType?: `${FlowNodeValTypeEnum}`;
  type?: `${FlowNodeOutputTypeEnum}`;
  targets: FlowNodeOutputTargetItemType[];
};
