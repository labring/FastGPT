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
import { Input_Template_DynamicInput } from '../../input';
import { Output_Template_AddOutput } from '../../output';
import { JS_TEMPLATE } from './constants';

export const CodeNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.code,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.code,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/code.svg',
  name: '代码运行',
  intro: '执行一段简单的脚本代码，通常用于进行复杂的数据处理。',
  showStatus: true,
  version: '482',
  inputs: [
    {
      ...Input_Template_DynamicInput,
      description: '这些变量会作为代码的运行的输入参数',
      editField: {
        key: true,
        valueType: true
      }
    },
    {
      key: NodeInputKeyEnum.codeType,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: 'js'
    },
    {
      key: NodeInputKeyEnum.code,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: '',
      value: JS_TEMPLATE
    }
  ],
  outputs: [
    {
      ...Output_Template_AddOutput,
      description: '将代码中 return 的对象作为输出，传递给后续的节点'
    },
    {
      id: NodeOutputKeyEnum.rawResponse,
      key: NodeOutputKeyEnum.rawResponse,
      label: '完整响应数据',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '运行错误',
      description: '代码运行错误信息，成功时返回空',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: 'qLUQfhG0ILRX',
      type: FlowNodeOutputTypeEnum.dynamic,
      key: 'result',
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'result'
    },
    {
      id: 'gR0mkQpJ4Og8',
      type: FlowNodeOutputTypeEnum.dynamic,
      key: 'data2',
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'data2'
    }
  ]
};
