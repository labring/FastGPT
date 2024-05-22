import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { getHandleConfig } from '../utils';

export const AssignedAnswerModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.answerNode,
  templateType: FlowNodeTemplateTypeEnum.textAnswer,
  flowNodeType: FlowNodeTypeEnum.answerNode,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/reply.png',
  name: '指定回复',
  intro:
    '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
  version: '481',
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.answerText,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      required: true,
      label: 'core.module.input.label.Response content',
      description: 'core.module.input.description.Response content',
      placeholder: 'core.module.input.description.Response content'
    }
  ],
  outputs: []
};
