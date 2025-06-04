// 你应该修改本文件
// You should modify this file

import { defineToolSet } from '@/type';
import tool from './baseChart';

export default defineToolSet({
  toolId: 'community-drawing',
  name: {
    'zh-CN': 'BI图表功能',
    en: 'BI Charts'
  },
  type: 'tools',
  description: {
    'zh-CN': 'BI图表功能，可以生成一些常用的图表，如饼图，柱状图，折线图等',
    en: 'BI Charts, can generate some common charts, such as pie charts, bar charts, line charts, etc.'
  },
  icon: 'core/workflow/template/BI',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  author: 'FastGPT',
  children: [tool] // 添加更多 tools
});
