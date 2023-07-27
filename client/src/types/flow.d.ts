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
  type?: 'inputs' | 'outputs';
  key: string;
  value: any;
  valueKey?: keyof FlowInputItemType & keyof FlowBodyItemType;
};

export type FlowInputItemType = {
  key: string; // 字段名
  value?: any;
  valueType?: `${FlowValueTypeEnum}`;
  type: `${FlowInputItemTypeEnum}`;
  label: string;
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
  label: string;
  description?: string;
  valueType?: `${FlowValueTypeEnum}`;
  type: `${FlowOutputItemTypeEnum}`;
  targets: FlowOutputTargetItemType[];
};

export type FlowModuleTemplateType = {
  logo: string;
  name: string;
  description?: string;
  intro: string;
  flowType: `${FlowModuleTypeEnum}`;
  url?: string;
  inputs: FlowInputItemType[];
  outputs: FlowOutputItemType[];
};
export type FlowModuleItemType = FlowModuleTemplateType & {
  moduleId: string;
  onChangeNode: (e: FlowModuleItemChangeProps) => void;
  onDelNode: (id: string) => void;
};
