import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { getHandleConfig } from '../utils';

export const SystemConfigNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.systemConfig,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.systemConfig,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: '/imgs/workflow/userGuide.png',
  name: '系统配置',
  intro: '可以配置应用的系统参数。',
  unique: true,
  forbidDelete: true,
  inputs: [
    {
      key: NodeInputKeyEnum.welcomeText,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'core.app.Welcome Text'
    },
    {
      key: NodeInputKeyEnum.variables,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: 'core.module.Variable',
      value: []
    },
    {
      key: NodeInputKeyEnum.questionGuide,
      valueType: WorkflowIOValueTypeEnum.boolean,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: ''
    },
    {
      key: NodeInputKeyEnum.tts,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: ''
    },
    {
      key: NodeInputKeyEnum.whisper,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: ''
    },
    {
      key: NodeInputKeyEnum.scheduleTrigger,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: ''
    }
  ],
  outputs: []
};
