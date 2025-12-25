import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
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
  Input_Template_File_Link
} from '../../input';
import { i18nT } from '../../../../../../web/i18n/utils';
import { Output_Template_Error_Message } from '../../output';

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
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/aiChat',
  avatarLinear: 'core/workflow/systemNode/aiChatLinear',
  colorSchema: 'blueDark',
  name: i18nT('workflow:template.ai_chat'),
  intro: i18nT('workflow:template.ai_chat_intro'),
  showStatus: true,
  isTool: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/ai_chat/',
  version: '4.9.7',
  catchError: false,
  inputs: [
    Input_Template_SettingAiModel,
    // --- settings modal
    {
      key: NodeInputKeyEnum.aiChatTemperature,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatMaxToken,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
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
    {
      key: NodeInputKeyEnum.aiChatReasoning,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.aiChatTopP,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatStopSign,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.aiChatResponseFormat,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.aiChatJsonSchema,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    // settings modal ---
    Input_Template_System_Prompt,
    Input_Template_History,
    Input_Template_Dataset_Quote,
    Input_Template_File_Link,
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
    },
    {
      id: NodeOutputKeyEnum.reasoningText,
      key: NodeOutputKeyEnum.reasoningText,
      required: false,
      label: i18nT('workflow:reasoning_text'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static,
      invalid: true,
      invalidCondition: ({ inputs, llmModelList }) => {
        const model = inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value;
        const modelItem = llmModelList.find((item) => item.model === model);
        return modelItem?.reasoning !== true;
      }
    },
    Output_Template_Error_Message
  ]
};
