import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
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
import { chatNodeSystemPromptTip } from '../tip';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { getHandleConfig } from '../utils';

export const ToolModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.tools,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  sourceHandle: getHandleConfig(true, true, false, true),
  targetHandle: getHandleConfig(true, true, false, true),
  avatar: '/imgs/workflow/tool.svg',
  name: '工具调用(实验)',
  intro: '通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。',
  showStatus: true,
  version: '481',
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
      valueType: WorkflowIOValueTypeEnum.number,
      min: 0,
      max: 10,
      step: 1
    },
    {
      key: NodeInputKeyEnum.aiChatMaxToken,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      value: 2000,
      valueType: WorkflowIOValueTypeEnum.number,
      min: 100,
      max: 4000,
      step: 50
    },
    {
      ...Input_Template_System_Prompt,
      label: 'core.ai.Prompt',
      description: chatNodeSystemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: 'core.module.output.label.Ai response content',
      description: 'core.module.output.description.Ai response content',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
