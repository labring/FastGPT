import {
  defineTool,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum
} from '@/type';

export default defineTool({
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '模版工具',
    en: 'Template tool'
  },
  description: {
    'zh-CN': '描述',
    en: 'description'
  },
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
});
