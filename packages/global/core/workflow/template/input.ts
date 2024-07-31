import { NodeInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { WorkflowIOValueTypeEnum } from '../constants';
import { chatNodeSystemPromptTip } from './tip';
import { FlowNodeInputItemType } from '../type/io';
import { i18nT } from '../../../../web/i18n/utils';

export const Input_Template_History: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.history,
  renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.chatHistory,
  label: 'core.module.input.label.chat history',
  description: '最多携带多少轮对话记录',
  required: true,
  min: 0,
  max: 50,
  value: 6
};

export const Input_Template_UserChatInput: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.userChatInput,
  renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
  valueType: WorkflowIOValueTypeEnum.string,
  label: '用户问题',
  required: true
};

export const Input_Template_DynamicInput: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.addInputParam,
  renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
  valueType: WorkflowIOValueTypeEnum.dynamic,
  label: '',
  required: false
};

export const Input_Template_SelectAIModel: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiModel,
  renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference],
  label: 'core.module.input.label.aiModel',
  required: true,
  valueType: WorkflowIOValueTypeEnum.string
};
export const Input_Template_SettingAiModel: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiModel,
  renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel, FlowNodeInputTypeEnum.reference],
  label: 'core.module.input.label.aiModel',
  valueType: WorkflowIOValueTypeEnum.string
};

export const Input_Template_System_Prompt: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiSystemPrompt,
  renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
  max: 3000,
  valueType: WorkflowIOValueTypeEnum.string,
  label: 'core.ai.Prompt',
  description: chatNodeSystemPromptTip,
  placeholder: chatNodeSystemPromptTip
};

export const Input_Template_Dataset_Quote: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiChatDatasetQuote,
  renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
  label: '',
  debugLabel: '知识库引用',
  description: '',
  valueType: WorkflowIOValueTypeEnum.datasetQuote
};
export const Input_Template_Text_Quote: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.stringQuoteText,
  renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
  label: i18nT('app:document_quote'),
  debugLabel: i18nT('app:document_quote'),
  description: i18nT('app:document_quote_tip'),
  valueType: WorkflowIOValueTypeEnum.string
};
