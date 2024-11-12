import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../constants';
import {
  Input_Template_SettingAiModel,
  Input_Template_Dataset_Quote,
  Input_Template_History,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput,
  Input_Template_File_Link_Prompt
} from '../../input';
import { chatNodeSystemPromptTip, systemPromptTip } from '../../tip';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const AiChatQuoteRole = {
  key: NodeInputKeyEnum.aiChatQuoteRole,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string,
  value: 'system' // user or system
};
export const AiChatQuoteTemplate = {
  key: NodeInputKeyEnum.aiChatQuoteTemplate,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string
};
export const AiChatQuotePrompt = {
  key: NodeInputKeyEnum.aiChatQuotePrompt,
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  label: '',
  valueType: WorkflowIOValueTypeEnum.string
};

export const AiChatModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.chatNode,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.chatNode,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/aiChat',
  name: i18nT('workflow:template.ai_chat'),
  intro: i18nT('workflow:template.ai_chat_intro'),
  showStatus: true,
  isTool: true,
  courseUrl: '/docs/guide/workbench/workflow/ai_chat/',
  version: '4813',
  inputs: [
    Input_Template_SettingAiModel,
    // --- settings modal
    {
      key: NodeInputKeyEnum.aiChatTemperature,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      value: 0,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatMaxToken,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      value: 2000,
      valueType: WorkflowIOValueTypeEnum.number
    },

    {
      key: NodeInputKeyEnum.aiChatIsResponseText,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: true,
      valueType: WorkflowIOValueTypeEnum.boolean
    },
    AiChatQuoteRole,
    AiChatQuoteTemplate,
    AiChatQuotePrompt,
    {
      key: NodeInputKeyEnum.aiChatVision,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    // settings modal ---
    {
      ...Input_Template_System_Prompt,
      label: i18nT('common:core.ai.Prompt'),
      description: systemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_Dataset_Quote,
    Input_Template_File_Link_Prompt,

    { ...Input_Template_UserChatInput, toolDescription: i18nT('workflow:user_question') }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.history,
      key: NodeOutputKeyEnum.history,
      required: true,
      label: i18nT('common:core.module.output.label.New context'),
      description: i18nT('common:core.module.output.description.New context'),
      valueType: WorkflowIOValueTypeEnum.chatHistory,
      valueDesc: chatHistoryValueDesc,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      required: true,
      label: i18nT('common:core.module.output.label.Ai response content'),
      description: i18nT('common:core.module.output.description.Ai response content'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
