import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
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
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';
import { Input_Template_File_Link_Prompt } from '../input';

export const ToolModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.tools,
  templateType: FlowNodeTemplateTypeEnum.ai,
  sourceHandle: getHandleConfig(true, true, false, true),
  targetHandle: getHandleConfig(true, true, false, true),
  avatar: 'core/workflow/template/toolCall',
  name: i18nT('workflow:template.tool_call'),
  intro: i18nT('workflow:template.tool_call_intro'),
  showStatus: true,
  courseUrl: '/docs/workflow/modules/tool/',
  version: '4813',
  inputs: [
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
    },
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
      key: NodeInputKeyEnum.aiChatVision,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    },

    {
      ...Input_Template_System_Prompt,
      label: i18nT('common:core.ai.Prompt'),
      description: systemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_File_Link_Prompt,
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
    }
  ]
};
