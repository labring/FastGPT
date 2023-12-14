import type { FlowNodeInputItemType } from '../node/type.d';
import { ModuleInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { ModuleIOValueTypeEnum } from '../constants';

export const Input_Template_Switch: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.switch,
  type: FlowNodeInputTypeEnum.target,
  label: 'core.module.input.label.switch',
  valueType: ModuleIOValueTypeEnum.any,
  showTargetInApp: true,
  showTargetInPlugin: true
};

export const Input_Template_History: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.history,
  type: FlowNodeInputTypeEnum.numberInput,
  label: 'core.module.input.label.chat history',
  required: true,
  min: 0,
  max: 30,
  valueType: ModuleIOValueTypeEnum.chatHistory,
  value: 6,
  showTargetInApp: true,
  showTargetInPlugin: true
};

export const Input_Template_UserChatInput: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.userChatInput,
  type: FlowNodeInputTypeEnum.target,
  label: 'core.module.input.label.user question',
  required: true,
  valueType: ModuleIOValueTypeEnum.string,
  showTargetInApp: true,
  showTargetInPlugin: true
};

export const Input_Template_AddInputParam: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.addInputParam,
  type: FlowNodeInputTypeEnum.addInputParam,
  valueType: ModuleIOValueTypeEnum.any,
  label: '',
  required: false,
  showTargetInApp: false,
  showTargetInPlugin: false
};
