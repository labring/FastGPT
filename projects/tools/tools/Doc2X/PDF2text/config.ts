import { defineTool } from '@/type';

export default defineTool({
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': 'PDF 识别',
    en: 'PDF Recognition'
  },
  description: {
    'zh-CN':
      '将PDF文件发送至Doc2X进行解析，返回结构化的LaTeX公式的文本(markdown)，支持传入String类型的URL或者流程输出中的文件链接变量',
    en: 'Send an PDF file to Doc2X for parsing and return the LaTeX formula in markdown format.'
  },
  icon: 'plugins/doc2x',
  inputs: [
    {
      renderTypeList: ['input'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'apikey',
      label: 'apikey',
      description: 'Doc2X的API密匙，可以从Doc2X开放平台获得',
      required: true,
      defaultValue: '',
      list: []
    },
    {
      renderTypeList: ['fileSelect'],
      selectedTypeIndex: 0,
      valueType: 'arrayString',
      key: 'files',
      label: 'files',
      description: '需要处理的PDF地址',
      required: true,
      list: [],
      canSelectFile: true,
      canSelectImg: false,
      maxFiles: 14,
      defaultValue: ''
    },
    {
      renderTypeList: ['switch', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'boolean',
      key: 'HTMLtable',
      label: 'HTMLtable',
      description:
        '是否以HTML格式输出表格。如果需要精确地输出表格，请打开此开关以使用HTML格式。关闭后，表格将转换为Markdown形式输出，但这可能会损失一些表格特性，如合并单元格。',
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
      type: 'static',
      key: 'result',
      label: '结果',
      description: '处理结果，由文件名以及文档内容组成，多个文件之间由横线分隔开',
      valueType: 'string'
    },
    {
      id: 'error',
      type: 'static',
      valueType: 'object',
      key: 'error',
      label: '错误',
      description: '错误信息'
    },
    {
      id: 'success',
      type: 'static',
      valueType: 'boolean',
      key: 'success',
      label: '成功',
      description: '成功信息'
    }
  ]
});
