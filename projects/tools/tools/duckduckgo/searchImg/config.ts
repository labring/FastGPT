import { defineTool } from '@/type';

export default defineTool({
  toolId: 'searchImg',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'DuckDuckGo 图片搜索',
    en: 'DockDuckGo Image Search'
  },
  description: {
    'zh-CN': '使用 DuckDuckGo 进行图片搜索',
    en: 'Use DuckDuckGo to search images'
  },
  icon: 'core/workflow/template/duckduckgo',
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
      type: 'static',
      valueType: 'string',
      key: 'result',
      label: 'result',
      description: ' 检索结果'
    }
  ]
});
