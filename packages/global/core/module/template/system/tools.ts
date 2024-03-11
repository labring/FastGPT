import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import {
  ModuleIOValueTypeEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import {
  Input_Template_AiModel,
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip } from '../tip';
import { Output_Template_Finish, Output_Template_UserChatInput } from '../output';
import { LLMModelTypeEnum } from '../../../ai/constants';

export const ToolModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.tools,
  flowType: FlowNodeTypeEnum.tools,
  templateType: ModuleTemplateTypeEnum.functionCall,
  avatar: '/imgs/module/tool.svg',
  name: '工具调用（实验）',
  intro: '通过AI模型自动选择一个或多个工具进行调用。工具可以是其他功能块或插件。',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      ...Input_Template_AiModel,
      llmModelType: LLMModelTypeEnum.toolCall
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
