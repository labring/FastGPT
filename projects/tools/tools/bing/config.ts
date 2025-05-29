import {
  defineTool,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  WorkflowIOValueTypeEnum
} from '@/type';

export default defineTool({
  toolId: 'community-bing',
  icon: 'core/workflow/template/bing',
  docURL: 'https://fael3z0zfze.feishu.cn/wiki/LsKAwOmtniA4vkkC259cmfxXnAc?fromScene=spaceOverview',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'search',
  name: {
    'zh-CN': 'Bing 搜索',
    en: 'Bing Search'
  },
  description: {
    'zh-CN': '调用 Bing 搜索接口，返回搜索结果',
    en: 'Call Bing search interface and return search results'
  },
  inputs: [
    {
      key: 'key',
      label: 'Bing API Key',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    },
    {
      key: 'query',
      label: '搜索关键词',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
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
