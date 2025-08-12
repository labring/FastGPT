const fs = require('node:fs/promises');
const path = require('node:path');
const fg = require('fast-glob');

// 假设 i18n.defaultLanguage = 'zh-CN'，这里不用 i18n 直接写两份逻辑即可

// 黑名单路径（不带语言前缀）
const blacklist = [
  'use-cases/index',
  'protocol/index',
  'api/index',
  'faq/index',
  'upgrading/index',
  'toc'
];

function filePathToUrl(filePath, lang) {
  const baseDir = path.join(__dirname, '../content/docs');
  let relativePath = filePath.replace(baseDir, '');
  const basePath = lang === 'zh-CN' ? '/docs' : '/en/docs';

  if (lang !== 'zh-CN' && relativePath.endsWith('.en.mdx')) {
    relativePath = relativePath.replace(/\.en\.mdx$/, '');
  } else if (lang === 'zh-CN' && relativePath.endsWith('.mdx')) {
    relativePath = relativePath.replace(/\.mdx$/, '');
  }

  return `${basePath}/${relativePath}`.replace(/\/\/+/g, '/');
}

function isBlacklisted(url) {
  return blacklist.some(
    (item) => url.endsWith(`/docs/${item}`) || url.endsWith(`/en/docs/${item}`)
  );
}

function isEnFile(file) {
  return file.endsWith('.en.mdx');
}

function isZhFile(file) {
  return file.endsWith('.mdx') && !file.endsWith('.en.mdx');
}

async function generateToc() {
  // 匹配所有 mdx 文件
  const allFiles = await fg(path.join(__dirname, '../content/docs/**/*.mdx'))

  // 筛选中英文文件
  const zhFiles = allFiles.filter(isZhFile);
  const enFiles = allFiles.filter(isEnFile);

  // 生成中文 URL
  const zhUrls = zhFiles
    .map((file) => filePathToUrl(file, 'zh-CN'))
    .filter((url) => !isBlacklisted(url))
    .sort();

  // 生成英文 URL
  const enUrls = enFiles
    .map((file) => filePathToUrl(file, 'en'))
    .filter((url) => !isBlacklisted(url))
    .sort();

  const makeMdxContent = (urls, title, isChinese = true) =>
    `---
title: ${title}
description: ${isChinese ? 'FastGPT 文档目录' : 'FastGPT Toc'}
---

${urls.map((url) => `- [${url}](${url})`).join('\n')}
`;

  // 写文件路径
  const baseDir = path.join(__dirname, '../content/docs');
  const zhOutputPath = path.join(baseDir, 'toc.mdx');
  const enOutputPath = path.join(baseDir, 'toc.en.mdx');

  // 写入文件
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(zhOutputPath, makeMdxContent(zhUrls, 'FastGPT 文档目录', true), 'utf8');
  await fs.writeFile(enOutputPath, makeMdxContent(enUrls, 'FastGPT Toc', false), 'utf8');

  console.log(`✅ 写入中文目录 ${zhOutputPath}`);
  console.log(`✅ 写入英文目录 ${enOutputPath}`);
}

generateToc().catch(console.error);
