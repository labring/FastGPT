import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '../../constants';
import {
  Input_Template_SettingAiModel,
  Input_Template_History,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip, systemPromptTip } from '../tip';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { i18nT } from '../../../../../web/i18n/utils';
import { Input_Template_File_Link } from '../input';
import { Output_Template_Error_Message } from '../output';

export const AgentNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agent,
  flowNodeType: FlowNodeTypeEnum.agent,
  templateType: FlowNodeTemplateTypeEnum.ai,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/toolCall',
  avatarLinear: 'core/workflow/systemNode/toolCallLinear',
  colorSchema: 'indigo',
  name: i18nT('workflow:template.agent'),
  intro: i18nT('workflow:template.agent_intro'),
  showStatus: true,
  catchError: false,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/tool/',
  version: '4.9.2',
  inputs: [
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
    },
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

    {
      ...Input_Template_System_Prompt,
      label: i18nT('common:core.ai.Prompt'),
      description: systemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_File_Link,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: i18nT('common:core.module.output.label.Ai response content'),
      description: i18nT('common:core.module.output.description.Ai response content'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    Output_Template_Error_Message
  ]
};
