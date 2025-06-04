import { defineTool } from '@/type';

export default defineTool({
  toolId: 'community-mathExprVal',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '数学公式执行',
    en: 'Mathematical Expression Execution'
  },
  description: {
    'zh-CN': '用于执行数学表达式的工具，通过 js 的 expr-eval 库运行表达式并返回结果。',
    en: 'A tool for executing mathematical expressions using the expr-eval library in js to return the result.'
  },
  icon: 'core/workflow/template/mathCall',
  inputs: [
    {
      renderTypeList: ['reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: '数学表达式',
      label: '数学表达式',
      description: '需要执行的数学表达式',
      required: true,
      toolDescription: '需要执行的数学表达式'
    }
  ],
  outputs: [
    {
      description: '返回的数学表达式结果',
      id: 'sowtxkCPjvb7',
      key: 'result',
      valueType: 'string',
      label: 'result',
      type: 'static'
    }
  ]
});
