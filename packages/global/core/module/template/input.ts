import type { FlowNodeInputItemType } from '../node/type.d';
import { ModuleInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { ModuleDataTypeEnum } from '../constants';

export const Input_Template_TFSwitch: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.switch,
  type: FlowNodeInputTypeEnum.target,
  label: 'core.modules.input.label.switch',
  valueType: ModuleDataTypeEnum.any
};

export const Input_Template_History: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.history,
  type: FlowNodeInputTypeEnum.target,
  label: 'core.modules.input.label.chat history',
  valueType: ModuleDataTypeEnum.chatHistory
};

export const Input_Template_UserChatInput: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.userChatInput,
  type: FlowNodeInputTypeEnum.target,
  label: 'core.modules.input.label.user question',
  required: true,
  valueType: ModuleDataTypeEnum.string
};
