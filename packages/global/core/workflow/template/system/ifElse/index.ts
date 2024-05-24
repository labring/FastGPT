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

export const IfElseNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.ifElseNode,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.ifElseNode,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, false, true, true),
  avatar: '/imgs/workflow/ifElse.svg',
  name: '判断器',
  intro: '根据一定的条件，执行不同的分支。',
  showStatus: true,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.ifElseList,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          condition: 'AND', // AND, OR
          list: [
            {
              variable: undefined,
              condition: undefined,
              value: undefined
            }
          ]
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.ifElseResult,
      key: NodeOutputKeyEnum.ifElseResult,
      label: '判断结果',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
