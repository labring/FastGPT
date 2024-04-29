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
import { FlowNodeTemplateType } from '../../../type';
import { getHandleConfig } from '../../utils';

export const ifElseNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.ifElseNode,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.ifElseNode,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, false, true, true),
  avatar: '/imgs/workflow/ifElse.svg',
  name: '判断器',
  intro: '根据一定的条件，执行不同的分支。',
  showStatus: true,
  inputs: [
    {
      key: NodeInputKeyEnum.condition,
      valueType: WorkflowIOValueTypeEnum.string,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      required: false,
      value: 'AND' // AND, OR
    },
    {
      key: NodeInputKeyEnum.ifElseList,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          variable: undefined,
          condition: undefined,
          value: undefined
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.if,
      key: NodeOutputKeyEnum.if,
      label: 'IF',
      valueType: WorkflowIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.source
    },
    {
      id: NodeOutputKeyEnum.else,
      key: NodeOutputKeyEnum.else,
      label: 'ELSE',
      valueType: WorkflowIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.source
    }
  ]
};
