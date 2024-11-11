import { NodeInputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { WorkflowIOValueTypeEnum } from '../constants';
import { chatNodeSystemPromptTip, systemPromptTip } from './tip';
import { FlowNodeInputItemType } from '../type/io';
import { i18nT } from '../../../../web/i18n/utils';

export const Input_Template_History: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.history,
  renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.chatHistory,
  label: i18nT('common:core.module.input.label.chat history'),
  description: i18nT('workflow:max_dialog_rounds'),

  required: true,
  min: 0,
  max: 50,
  value: 6
};

export const Input_Template_UserChatInput: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.userChatInput,
  renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
  valueType: WorkflowIOValueTypeEnum.string,
  label: i18nT('workflow:user_question'),
  toolDescription: i18nT('workflow:user_question_tool_desc'),
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
  label: i18nT('common:core.module.input.label.aiModel'),
  required: true,
  valueType: WorkflowIOValueTypeEnum.string
};
export const Input_Template_SettingAiModel: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiModel,
  renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel, FlowNodeInputTypeEnum.reference],
  label: i18nT('common:core.module.input.label.aiModel'),
  valueType: WorkflowIOValueTypeEnum.string
};

export const Input_Template_System_Prompt: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiSystemPrompt,
  renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
  max: 3000,
  valueType: WorkflowIOValueTypeEnum.string,
  label: i18nT('common:core.ai.Prompt'),
  description: systemPromptTip,
  placeholder: chatNodeSystemPromptTip
};

export const Input_Template_Dataset_Quote: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.aiChatDatasetQuote,
  renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
  label: '',
  debugLabel: i18nT('workflow:knowledge_base_reference'),
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

export const Input_Template_File_Link_Prompt: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.fileUrlList,
  renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
  label: i18nT('app:file_quote_link'),
  debugLabel: i18nT('app:file_quote_link'),
  valueType: WorkflowIOValueTypeEnum.arrayString
};
export const Input_Template_File_Link: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.fileUrlList,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  label: i18nT('app:workflow.user_file_input'),
  debugLabel: i18nT('app:workflow.user_file_input'),
  description: i18nT('app:workflow.user_file_input_desc'),
  valueType: WorkflowIOValueTypeEnum.arrayString
};

export const Input_Template_Children_Node_List: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.childrenNodeIdList,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  valueType: WorkflowIOValueTypeEnum.arrayString,
  label: '',
  value: []
};
export const Input_Template_Node_Width: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.nodeWidth,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  valueType: WorkflowIOValueTypeEnum.number,
  label: '',
  value: 900
};
export const Input_Template_Node_Height: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.nodeHeight,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  valueType: WorkflowIOValueTypeEnum.number,
  label: '',
  value: 600
};
export const Input_Template_LOOP_NODE_OFFSET: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.loopNodeInputHeight,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  valueType: WorkflowIOValueTypeEnum.number,
  label: '',
  value: 320
};

export const Input_Template_Stream_MODE: FlowNodeInputItemType = {
  key: NodeInputKeyEnum.forbidStream,
  renderTypeList: [FlowNodeInputTypeEnum.switch],
  valueType: WorkflowIOValueTypeEnum.boolean,
  label: i18nT('workflow:template.forbid_stream'),
  description: i18nT('workflow:template.forbid_stream_desc'),
  value: false
};
