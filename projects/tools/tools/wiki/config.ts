import { defineTool, FlowNodeOutputTypeEnum, WorkflowIOValueTypeEnum } from '@/type';

export default defineTool({
  toolId: 'community-wiki',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'Wiki搜索',
    en: 'Wiki Search'
  },
  description: {
    'zh-CN': '在Wiki中查询释义。',
    en: 'Search meanings in Wiki.'
  },
  icon: 'core/workflow/template/wiki',
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
    }
  ],
  outputs: [
    {
      id: 'result',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'result',
      label: '搜索结果',
      description: '搜索结果'
    }
  ]
});
