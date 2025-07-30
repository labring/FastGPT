import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { i18n } from '@/lib/i18n';

export const revalidate = false;

// 黑名单路径（不带语言前缀）
const blacklist = ['use-cases/index', 'protocol/index', 'api/index'];

// 将文件路径转换为 URL 路径（包括文件名）
function filePathToUrl(filePath: string, defaultLanguage: string): string {
  let relativePath = filePath.replace('./content/docs/', '');

  const basePath = defaultLanguage === 'zh-CN' ? '/docs' : '/en/docs';

  if (defaultLanguage !== 'zh-CN' && relativePath.endsWith('.en.mdx')) {
    relativePath = relativePath.replace(/\.en\.mdx$/, '');
  } else if (relativePath.endsWith('.mdx')) {
    relativePath = relativePath.replace(/\.mdx$/, '');
  }

  return `${basePath}/${relativePath}`.replace(/\/\/+/g, '/');
}

// 判断是否为黑名单路径
function isBlacklisted(url: string): boolean {
  return blacklist.some(
    (item) => url.endsWith(`/docs/${item}`) || url.endsWith(`/en/docs/${item}`)
  );
}

export async function GET(request: Request) {
  const defaultLanguage = i18n.defaultLanguage;

  const requestUrl = new URL(request.url);
  const isEnRobotsRoute = requestUrl.pathname === '/en/robots';

  let globPattern;
  if (isEnRobotsRoute) {
    globPattern = ['./content/docs/**/*.en.mdx'];
  } else if (defaultLanguage === 'zh-CN') {
    globPattern = ['./content/docs/**/*.mdx'];
  } else {
    globPattern = ['./content/docs/**/*.en.mdx'];
  }

  const files = await fg(globPattern, { caseSensitiveMatch: true });

  // 转换文件路径为 URL，并过滤黑名单
  const urls = files
    .map((file) => filePathToUrl(file, defaultLanguage))
    .filter((url) => !isBlacklisted(url));

  urls.sort((a, b) => a.localeCompare(b));

  const html = `
    <html>
      <head>
        <title>FastGPT 文档目录</title>
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
          ${urls.map((url) => `<li><a href="${url}">${url}</a></li>`).join('')}
        </ul>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html'
    }
  });
}
