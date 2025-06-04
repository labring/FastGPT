import { defineTool, FlowNodeOutputTypeEnum, WorkflowIOValueTypeEnum } from '@/type';

export default defineTool({
  toolId: 'community-searchXNG',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'Search XNG 搜索',
    en: 'Search XNG'
  },
  description: {
    'zh-CN': '使用 Search XNG 服务进行搜索。',
    en: 'Use Search XNG service for search.'
  },
  icon: 'core/workflow/template/searxng',
  docURL: '/docs/guide/plugins/searxng_plugin_guide/',
  inputs: [
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'query',
      label: 'query',
      description: '检索词',
      required: true,
      toolDescription: '检索词'
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'url',
      label: 'url',
      description: '部署的searXNG服务的链接',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      maxFiles: 5,
      canSelectFile: true,
      canSelectImg: true,
      required: true
    }
  ],
  outputs: [
    {
      id: 'result',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'result',
      label: '搜索结果',
      description: ' 检索结果'
    },
    {
      id: 'error',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'error',
      label: '错误信息',
      description: '错误信息'
    }
  ]
});
