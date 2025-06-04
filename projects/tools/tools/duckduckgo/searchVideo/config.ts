import { defineTool } from '@/type';

export default defineTool({
  toolId: 'searchVideo',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'DuckDuckGo 视频检索',
    en: 'DockDuckGo Video Search'
  },
  description: {
    'zh-CN': '使用 DuckDuckGo 进行视频检索',
    en: 'Use DuckDuckGo to search videos'
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
