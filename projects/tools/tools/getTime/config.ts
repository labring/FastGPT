import {
  defineTool,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum
} from '@/type';

export default defineTool({
  toolId: 'community-getTime',
  versionList: [
    {
      version: '1.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '获取当前时间',
    en: 'Get current time'
  },
  description: {
    'zh-CN': '获取当前时间',
    en: 'Get current time'
  },
  author: 'FastGPT',
  icon: 'core/workflow/template/getTime',
  inputs: [
    {
      key: 'formatStr',
      label: '格式化字符串',
      renderTypeList: ['input', 'reference']
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
