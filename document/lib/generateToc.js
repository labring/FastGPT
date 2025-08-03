import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fg from 'fast-glob';
import { i18n } from './i18n.ts'; // ✅ 根据你项目实际路径修改

// 黑名单路径（不带语言前缀）
const blacklist = [
  'use-cases/index',
  'protocol/index',
  'api/index',
  'faq/index',
  'upgrading/index'
];

// 将文件路径转换为 URL 路径（包括文件名）
function filePathToUrl(filePath, defaultLanguage) {
  const baseDir = path.resolve('../content/docs'); // 请确认路径正确

  let relativePath = path.relative(baseDir, path.resolve(filePath)).replace(/\\/g, '/');

  const basePath = defaultLanguage === 'zh-CN' ? '/docs' : '/en/docs';

  if (defaultLanguage !== 'zh-CN' && relativePath.endsWith('.en.mdx')) {
    relativePath = relativePath.replace(/\.en\.mdx$/, '');
  } else if (relativePath.endsWith('.mdx')) {
    relativePath = relativePath.replace(/\.mdx$/, '');
  }

  return `${basePath}/${relativePath}`.replace(/\/\/+/g, '/');
}

// 判断是否为黑名单路径
function isBlacklisted(url) {
  return blacklist.some(
    (item) => url.endsWith(`/docs/${item}`) || url.endsWith(`/en/docs/${item}`)
  );
}

async function generateTocMdx() {
  const defaultLanguage = i18n.defaultLanguage || 'zh-CN';

  const globPattern =
    defaultLanguage === 'zh-CN' ? ['../content/docs/**/*.mdx'] : ['../content/docs/**/*.en.mdx'];

  console.log('📄 globPattern:', globPattern);
  const files = await fg(globPattern, { caseSensitiveMatch: true });
  console.log('📄 files:', files);

  const urls = files
    .map((file) => filePathToUrl(file, defaultLanguage))
    .filter((url) => !isBlacklisted(url))
    .sort((a, b) => a.localeCompare(b));

  console.log('📄 URLs 生成结果:\n', urls);

  const mdxContent = `---
title: FastGPT 文档目录
description: FastGPT 文档目录
---

${urls.map((url) => `- [${url}](${url})`).join('\n')}
`;

  const outputPath = path.resolve('../content/docs/toc.mdx');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, mdxContent, 'utf8');
  console.log(`✅ 已写入 ${outputPath}`);
}

generateTocMdx().catch(console.error);
