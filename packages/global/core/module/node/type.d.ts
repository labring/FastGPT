import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeValTypeEnum,
  FlowNodeTypeEnum
} from './constant';

export type FlowNodeChangeProps = {
  moduleId: string;
  type:
    | 'attr' // key: attr, value: new value
    | 'updateInput' // key: update input key, value: new input value
    | 'replaceInput' // key: old input key, value: new input value
    | 'addInput' // key: null, value: new input value
    | 'delInput' // key: delete input key, value: null
    | 'updateOutput' // key: update output key, value: new output value
    | 'replaceOutput' // key: old output key, value: new output value
    | 'addOutput' // key: null, value: new output value
    | 'delOutput'; // key: delete output key, value: null
  key?: string;
  value?: any;
  index?: number;
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
