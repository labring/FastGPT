import * as fs from 'node:fs/promises';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

// 将文件路径转换为URL路径
function filePathToUrl(filePath: string, defaultLanguage: string): string {
  // 移除 ./content/docs/ 前缀
  let urlPath = filePath.replace('./content/docs/', '');
  
  // 确定基础路径
  const basePath = defaultLanguage === 'zh-CN' ? '/docs' : '/en/docs';
  
  // 如果是英文文件，移除 .en 后缀
  if (defaultLanguage !== 'zh-CN' && urlPath.endsWith('.en.mdx')) {
    urlPath = urlPath.replace('.en.mdx', '');
  } else if (urlPath.endsWith('.mdx')) {
    urlPath = urlPath.replace('.mdx', '');
  }
  
  // 处理 index 文件
  if (urlPath.endsWith('/index')) {
    urlPath = urlPath.replace('/index', '');
  }
  
  // 拼接完整路径
  return `${basePath}/${urlPath}`.replace(/\/\/+/g, '/');
}

export async function GET(request: Request) {
  const defaultLanguage = i18n.defaultLanguage;
  
  // 检查请求路径是否为 /en/robots
  const requestUrl = new URL(request.url);
  const isEnRobotsRoute = requestUrl.pathname === '/en/robots';

  let globPattern;

  if (isEnRobotsRoute) {
    // 如果是 /en/robots 路由，只选择 .en.mdx 文件
    globPattern = ['./content/docs/**/*.en.mdx'];
  } else if (defaultLanguage === 'zh-CN') {
    // 中文环境下的普通路由
    globPattern = ['./content/docs/**/*.mdx'];
  } else {
    // 英文环境下的普通路由
    globPattern = ['./content/docs/**/*.en.mdx'];
  }

  const files = await fg(globPattern);

  const urls = await Promise.all(
    files.map(async (file: string) => {
      const urlPath = filePathToUrl(file, defaultLanguage);
      return `${urlPath}`;
    })
  );

  // 按URL排序
  urls.sort((a, b) => a.localeCompare(b));

  // 生成HTML链接列表
  const html = `
    <html>
      <head>
        <title>FastGPT Documentation Links</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          ul { list-style-type: none; padding: 0; }
          li { margin: 10px 0; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Documentation Links</h1>
        <ul>
          ${urls.map(url => `<li><a href="${url}">${url}</a></li>`).join('')}
        </ul>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}