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
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_UserChatInput
} from '../input';
import { Output_Template_Finish, Output_Template_UserChatInput } from '../output';

export const RunAppModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.runApp,
  templateType: ModuleTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.runApp,
  avatar: '/imgs/module/app.png',
  name: '应用调用',
  intro: '可以选择一个其他应用进行调用',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.runAppSelectApp,
      type: FlowNodeInputTypeEnum.selectApp,
      valueType: ModuleIOValueTypeEnum.selectApp,
      label: '选择一个应用',
      description: '选择一个其他应用进行调用',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    Output_Template_UserChatInput,
    {
      key: ModuleOutputKeyEnum.history,
      label: '新的上下文',
      description: '将该应用回复内容拼接到历史记录中，作为新的上下文返回',
      valueType: ModuleIOValueTypeEnum.chatHistory,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.answerText,
      label: 'AI回复',
      description: '将在应用完全结束后触发',
      valueType: ModuleIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    Output_Template_Finish
  ]
};
