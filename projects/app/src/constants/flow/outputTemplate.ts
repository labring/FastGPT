import type { FlowOutputItemType } from '@/types/core/app/flow';
import { SystemOutputEnum } from '../app';
import { FlowOutputItemTypeEnum, FlowValueTypeEnum } from './index';

export const Output_Template_Finish: FlowOutputItemType = {
  key: SystemOutputEnum.finish,
  label: '模块调用结束',
  description: '模块调用结束时触发',
  valueType: FlowValueTypeEnum.boolean,
  type: FlowOutputItemTypeEnum.source,
  targets: []
};
