import { defineTool } from '@/type';

export default defineTool({
  toolId: 'baseChart',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '基础图表',
    en: 'baseChart'
  },
  description: {
    'zh-CN': '根据数据生成图表，可根据chartType生成柱状图，折线图，饼图',
    en: 'Generate charts based on data, and generate charts such as bar charts, line charts, pie charts based on chartType'
  },
  icon: 'core/workflow/template/baseChart',
  inputs: [
    {
      renderTypeList: ['input', 'reference'],
      key: 'title',
      label: 'title',
      description: 'BI图表的标题',
      toolDescription: 'BI图表的标题'
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'arrayString',
      key: 'xAxis',
      label: 'xAxis',
      description: 'x轴数据，例如：["A", "B", "C"]',
      defaultValue: '',
      required: true,
      toolDescription: 'x轴数据，例如：["A", "B", "C"]',
      list: [
        {
          label: '',
          value: ''
        }
      ]
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'arrayString',
      key: 'yAxis',
      label: 'yAxis',
      description: 'y轴数据，例如：[1,2,3]',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true,
      toolDescription: 'y轴数据，例如：[1,2,3]'
    },
    {
      renderTypeList: ['select', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'chartType',
      label: 'chartType',
      description: '图表类型：柱状图，折线图，饼图',
      defaultValue: '',
      required: true,
      list: [
        {
          label: '柱状图',
          value: '柱状图'
        },
        {
          label: '折线图',
          value: '折线图'
        },
        {
          label: '饼图',
          value: '饼图'
        }
      ],
      toolDescription: '图表类型：柱状图，折线图，饼图'
    }
  ],
  outputs: [
    {
      id: '图表 url',
      type: 'static',
      description: '可用使用markdown格式展示图片，如：![图片](url)',
      defaultValue: '',
      label: '图表 url',
      key: '图表 url'
    }
  ]
});
