import {
  FlowBodyItemTypeEnum,
  FlowInputItemTypeEnum,
  FlowOutputItemTypeEnum
} from '@/constants/flow';
import { Connection } from 'reactflow';
import type { AppModuleItemType } from './app';

export type FlowInputItemType = {
  key: string; // 字段名
  value?: any;
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
  type: `${FlowOutputItemTypeEnum}`;
  response?: boolean;
  targets: FlowOutputTargetItemType[];
};

export type FlowModuleItemChangeProps = {
  moduleId: string;
  key: string;
  value: any;
  valueKey?: keyof FlowInputItemType & keyof FlowBodyItemType;
};

export type FlowModuleItemType = AppModuleItemType & {
  onChangeNode: (e: FlowModuleItemChangeProps) => void;
  onDelNode: (id: string) => void;
};
