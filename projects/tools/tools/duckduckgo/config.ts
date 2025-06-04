// 你应该修改本文件
// You should modify this file

import { defineToolSet } from '@/type';
import search from './search';
import searchImg from './searchImg';
import searchNews from './searchNews';
import searchVideo from './searchVideo';
// import tool2 from './tool2'; 添加更多 tools

export default defineToolSet({
  toolId: 'community-duckduckgo',
  name: {
    'zh-CN': 'DuckDuckGo服务',
    en: 'DuckDuckGo Service'
  },
  type: 'search',
  description: {
    'zh-CN': 'DuckDuckGo 服务，包含网络搜索、图片搜索、新闻搜索等。',
    en: 'DuckDuckGo Service, including network search, image search, news search, etc.'
  },
  icon: 'core/workflow/template/duckduckgo',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  author: 'FastGPT',
  children: [search, searchImg, searchNews, searchVideo] // 添加更多 tools
});
