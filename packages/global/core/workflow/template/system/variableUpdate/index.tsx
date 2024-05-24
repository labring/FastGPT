import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/index.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { getHandleConfig } from '../../utils';

export const VariableUpdateNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.variableUpdate,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.variableUpdate,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/variable.png',
  name: '变量更新',
  intro: '可以更新指定节点的输出值或更新全局变量',
  showStatus: false,
  isTool: false,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.updateList,
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      editField: {
        key: true,
        valueType: true
      },
      value: [
        {
          variable: ['', ''],
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.string,
          renderType: FlowNodeInputTypeEnum.input
        }
      ]
    }
  ],
  outputs: []
};
