import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum,
  type ToolType
} from '../../type';

export const config: Omit<ToolType, 'cb'> = {
  toolId: 'community-getTime',
  type: 'tools',
  name: {
    'zh-CN': '获取当前时间',
    en: 'Get current time'
  },
  description: {
    'zh-CN': '获取当前时间',
    en: 'Get current time'
  },
  isTool: true,
  icon: '',
  inputs: [
    {
      key: 'formatStr',
      label: '格式化字符串',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    }
  ],
  outputs: [
    {
      id: 'time',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'time',
      label: '时间',
      description: '当前时间'
    }
  ]
};
