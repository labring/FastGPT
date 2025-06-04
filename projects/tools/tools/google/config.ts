import {
  defineTool,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum
} from '@/type';

export default defineTool({
  toolId: 'community-google',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'Google 搜索',
    en: 'Google search'
  },
  description: {
    'zh-CN': '在 Google 中搜索',
    en: 'Search in Google'
  },
  icon: 'core/workflow/template/google',
  docURL: 'https://fael3z0zfze.feishu.cn/wiki/Vqk1w4ltNiuLifkHTuoc0hSrnVg?fromScene=spaceOverview',
  inputs: [
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'cx',
      label: 'cx',
      description: 'Google搜索cxID',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'key',
      label: 'key',
      description: 'Google搜索key',
      defaultValue: '',
      required: true,
      list: []
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'query',
      label: 'query',
      description: '查询字段值',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true,
      toolDescription: '查询字段值'
    }
  ],
  outputs: [
    {
      id: 'result',
      valueType: 'object',
      key: 'result',
      label: 'result',
      type: 'static'
    }
  ]
});
