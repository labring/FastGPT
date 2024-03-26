import type { FlowNodeInputItemType } from '../node/type.d';
import { DYNAMIC_INPUT_KEY, ModuleInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { ModuleIOValueTypeEnum } from '../constants';
import { chatNodeSystemPromptTip } from './tip';

export const Input_Template_Switch: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.switch,
  type: FlowNodeInputTypeEnum.hidden,
  label: '',
  description: 'core.module.input.description.Trigger',
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
  type: FlowNodeInputTypeEnum.custom,
  label: '',
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

export const Input_Template_DynamicInput: FlowNodeInputItemType = {
  key: DYNAMIC_INPUT_KEY,
  type: FlowNodeInputTypeEnum.target,
  valueType: ModuleIOValueTypeEnum.any,
  label: 'core.module.inputType.dynamicTargetInput',
  description: 'core.module.input.description.dynamic input',
  required: false,
  showTargetInApp: false,
  showTargetInPlugin: true,
  hideInApp: true
};

export const Input_Template_SelectAIModel: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.aiModel,
  type: FlowNodeInputTypeEnum.selectLLMModel,
  label: 'core.module.input.label.aiModel',
  required: true,
  valueType: ModuleIOValueTypeEnum.string,
  showTargetInApp: false,
  showTargetInPlugin: false
};
export const Input_Template_SettingAiModel: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.aiModel,
  type: FlowNodeInputTypeEnum.settingLLMModel,
  label: 'core.module.input.label.aiModel',
  required: true,
  valueType: ModuleIOValueTypeEnum.string,
  showTargetInApp: false,
  showTargetInPlugin: false
};

export const Input_Template_System_Prompt: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.aiSystemPrompt,
  type: FlowNodeInputTypeEnum.textarea,
  max: 3000,
  valueType: ModuleIOValueTypeEnum.string,
  label: 'core.ai.Prompt',
  description: chatNodeSystemPromptTip,
  placeholder: chatNodeSystemPromptTip,
  showTargetInApp: true,
  showTargetInPlugin: true
};

export const Input_Template_Dataset_Quote: FlowNodeInputItemType = {
  key: ModuleInputKeyEnum.aiChatDatasetQuote,
  type: FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  label: '知识库引用',
  description: 'core.module.Dataset quote.Input description',
  valueType: ModuleIOValueTypeEnum.datasetQuote,
  showTargetInApp: true,
  showTargetInPlugin: true
};
