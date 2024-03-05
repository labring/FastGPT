import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import {
  Input_Template_AiModel,
  Input_Template_Dataset_Quote,
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip } from '../tip';
import { Output_Template_Finish, Output_Template_UserChatInput } from '../output';

export const ToolModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.tools,
  flowType: FlowNodeTypeEnum.tools,
  templateType: ModuleTemplateTypeEnum.functionCall,
  avatar: '/imgs/module/AI.png',
  name: '工具调用',
  intro: '通过AI模型自动选择一个或多个工具进行调用。工具可以是其他功能块，可以是插件。',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    Input_Template_AiModel,
    {
      ...Input_Template_System_Prompt,
      label: 'core.ai.Prompt',
      description: chatNodeSystemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [Output_Template_UserChatInput, Output_Template_Finish]
};
