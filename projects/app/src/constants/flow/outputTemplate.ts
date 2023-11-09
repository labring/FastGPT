import type { FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';
import { SystemOutputEnum } from '../app';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeValTypeEnum
} from '@fastgpt/global/core/module/node/constant';

export const Output_Template_Finish: FlowNodeOutputItemType = {
  key: SystemOutputEnum.finish,
  label: '模块调用结束',
  description: '模块调用结束时触发',
  valueType: FlowNodeValTypeEnum.boolean,
  type: FlowNodeOutputTypeEnum.source,
  targets: []
};
