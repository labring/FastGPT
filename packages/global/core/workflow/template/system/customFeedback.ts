import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '../../constants';
import { getHandleConfig } from '../utils';

export const CustomFeedbackNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.customFeedback,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.customFeedback,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/customFeedback',
  name: '自定义反馈',
  intro: '该模块被触发时，会给当前的对话记录增加一条反馈。可用于自动记录对话效果等。',
  version: '486',
  inputs: [
    {
      key: NodeInputKeyEnum.textareaInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: '反馈的文本'
    }
  ],
  outputs: []
};
