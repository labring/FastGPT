import type { FlowNodeOutputItemType } from '../node/type';
import { ModuleOutputKeyEnum } from '../constants';
import { FlowNodeOutputTypeEnum } from '../node/constant';
import { ModuleIOValueTypeEnum } from '../constants';

export const Output_Template_UserChatInput: FlowNodeOutputItemType = {
  key: ModuleOutputKeyEnum.userChatInput,
  label: 'core.module.input.label.user question',
  type: FlowNodeOutputTypeEnum.hidden,
  valueType: ModuleIOValueTypeEnum.string,
  targets: []
};

export const Output_Template_Finish: FlowNodeOutputItemType = {
  key: ModuleOutputKeyEnum.finish,
  label: 'core.module.output.label.running done',
  description: 'core.module.output.description.running done',
  valueType: ModuleIOValueTypeEnum.boolean,
  type: FlowNodeOutputTypeEnum.source,
  targets: []
};

export const Output_Template_AddOutput: FlowNodeOutputItemType = {
  key: ModuleOutputKeyEnum.addOutputParam,
  type: FlowNodeOutputTypeEnum.addOutputParam,
  valueType: ModuleIOValueTypeEnum.any,
  label: '',
  targets: []
};
