import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node.d';
import { getHandleConfig } from '../../utils';

export const UserSelectNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.userSelect,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.userSelect,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, false, true, true),
  avatar: 'core/workflow/template/userSelect',
  diagram: '/imgs/app/userSelect.svg',
  name: '用户选择',
  intro: `该模块可配置多个选项，以供对话时选择。不同选项可导向不同工作流支线`,
  showStatus: true,
  version: '489',
  inputs: [
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '说明文字'
    },
    {
      key: NodeInputKeyEnum.userSelectOptions,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          value: '选项1',
          key: 'option1'
        },
        {
          value: '选项2',
          key: 'option2'
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.selectResult,
      key: NodeOutputKeyEnum.selectResult,
      required: true,
      label: '选择结果',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
