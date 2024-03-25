import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';
import {
  ModuleIOValueTypeEnum,
  ModuleOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  ModuleInputKeyEnum
} from '../../constants';
import {
  Input_Template_SettingAiModel,
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip } from '../tip';
import { Output_Template_Finish, Output_Template_UserChatInput } from '../output';
import { LLMModelTypeEnum } from '../../../ai/constants';

export const ToolModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tools,
  flowType: FlowNodeTypeEnum.tools,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  avatar: '/imgs/module/tool.svg',
  name: '工具调用（实验）',
  intro: '通过AI模型自动选择一个或多个功能块进行调用，也可以对插件进行调用。',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      key: ModuleInputKeyEnum.aiChatTemperature,
      type: FlowNodeInputTypeEnum.hidden, // Set in the pop-up window
      label: '',
      value: 0,
      valueType: ModuleIOValueTypeEnum.number,
      min: 0,
      max: 10,
      step: 1,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiChatMaxToken,
      type: FlowNodeInputTypeEnum.hidden, // Set in the pop-up window
      label: '',
      value: 2000,
      valueType: ModuleIOValueTypeEnum.number,
      min: 100,
      max: 4000,
      step: 50,
      showTargetInApp: false,
      showTargetInPlugin: false
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
    Output_Template_UserChatInput,
    {
      key: ModuleOutputKeyEnum.selectedTools,
      valueType: ModuleIOValueTypeEnum.tools,
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    },
    Output_Template_Finish
  ]
};
