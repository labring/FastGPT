import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_History, Input_Template_UserChatInput } from '../input';
import { getHandleConfig } from '../utils';

export const RunAppModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.runApp,
  templateType: FlowNodeTemplateTypeEnum.externalCall,
  flowNodeType: FlowNodeTypeEnum.runApp,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/app.png',
  name: '应用调用',
  intro: '可以选择一个其他应用进行调用',
  showStatus: true,
  version: '481',
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.runAppSelectApp,
      renderTypeList: [FlowNodeInputTypeEnum.selectApp, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.selectApp,
      label: '选择一个应用',
      description: '选择一个其他应用进行调用',
      required: true
    },
    Input_Template_History,
    {
      ...Input_Template_UserChatInput,
      toolDescription: '用户问题'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.history,
      key: NodeOutputKeyEnum.history,
      label: '新的上下文',
      description: '将该应用回复内容拼接到历史记录中，作为新的上下文返回',
      valueType: WorkflowIOValueTypeEnum.chatHistory,
      required: true,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: '回复的文本',
      description: '将在应用完全结束后触发',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
