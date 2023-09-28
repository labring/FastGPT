import {
  FlowBodyItemTypeEnum,
  FlowInputItemTypeEnum,
  FlowOutputItemTypeEnum,
  FlowValueTypeEnum
} from '@/constants/flow';
import { Connection } from 'reactflow';
import type { AppModuleItemType } from './app';
import { FlowModuleTypeEnum } from '@/constants/flow';

export type FlowModuleItemChangeProps = {
  moduleId: string;
  type: 'attr' | 'inputs' | 'outputs' | 'addInput' | 'delInput';
  key: string;
  value: any;
};

export type FlowInputItemType = {
  key: string; // 字段名
  value?: any;
  valueType?: `${FlowValueTypeEnum}`;
  type: `${FlowInputItemTypeEnum}`;
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
};

export type FlowOutputTargetItemType = {
  moduleId: string;
  key: string;
};
export type FlowOutputItemType = {
  key: string; // 字段名
  label?: string;
  edit?: boolean;
  description?: string;
  valueType?: `${FlowValueTypeEnum}`;
  type?: `${FlowOutputItemTypeEnum}`;
  targets: FlowOutputTargetItemType[];
};

export type FlowModuleTemplateType = {
  flowType: `${FlowModuleTypeEnum}`; // unique
  logo: string;
  name: string;
  description?: string;
  intro: string;
  showStatus?: boolean; // chatting response step status
  inputs: FlowInputItemType[];
  outputs: FlowOutputItemType[];
};
export type FlowModuleItemType = FlowModuleTemplateType & {
  moduleId: string;
};
