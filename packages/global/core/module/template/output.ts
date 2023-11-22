import type { FlowNodeOutputItemType } from '../node/type';
import { ModuleOutputKeyEnum } from '../constants';
import { FlowNodeOutputTypeEnum } from '../node/constant';
import { ModuleDataTypeEnum } from '../constants';

export const Output_Template_Finish: FlowNodeOutputItemType = {
  key: ModuleOutputKeyEnum.finish,
  label: 'core.module.output.label.running done',
  description: 'core.module.output.description.running done',
  valueType: ModuleDataTypeEnum.boolean,
  type: FlowNodeOutputTypeEnum.source,
  targets: []
};
