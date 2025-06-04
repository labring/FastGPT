// 你应该修改本文件
// You should modify this file

import { defineToolSet } from '@/type';
import tool from './PDF2text';

export default defineToolSet({
  toolId: 'community-Doc2X',
  name: {
    'zh-CN': 'Doc2X 服务',
    en: 'Doc2X Service'
  },
  type: 'tools',
  description: {
    'zh-CN': '将传入的图片或PDF文件发送至Doc2X进行解析，返回带LaTeX公式的markdown格式的文本。',
    en: 'Send an image or PDF file to Doc2X for parsing and return the LaTeX formula in markdown format.'
  },
  icon: 'plugins/doc2x',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  author: 'FastGPT',
  children: [tool] // 添加更多 tools
});
