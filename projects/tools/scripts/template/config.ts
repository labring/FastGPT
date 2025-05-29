// 你应该修改本文件
// You should modify this file

import { defineToolSet } from '@/type';
import tool from './tool';
// import tool2 from './tool2'; 添加更多 tools

export default defineToolSet({
  name: {
    'zh-CN': '样例工具集',
    en: 'Template Tool Set'
  },
  type: 'tools',
  description: {
    'zh-CN': '这是一个样例工具集',
    en: 'This is a sample tool set'
  },
  icon: '',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  author: 'FastGPT',
  children: [tool] // 添加更多 tools
});
