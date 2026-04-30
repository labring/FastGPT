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
  const baseDir = path.join(__dirname, '../content');
  let relativePath = filePath.replace(baseDir, '');
  const basePath = lang === 'zh-CN' ? '' : '/en';

  if (lang !== 'zh-CN' && relativePath.endsWith('.en.mdx')) {
    relativePath = relativePath.replace(/\.en\.mdx$/, '');
  } else if (lang === 'zh-CN' && relativePath.endsWith('.mdx')) {
    relativePath = relativePath.replace(/\.mdx$/, '');
  }

  return `${basePath}/${relativePath}`.replace(/\/\/+/g, '/');
}

function isBlacklisted(url) {
  return blacklist.some((item) => url.endsWith(`/${item}`));
}

function isEnFile(file) {
  return file.endsWith('.en.mdx');
}

function isZhFile(file) {
  return file.endsWith('.mdx') && !file.endsWith('.en.mdx');
}

async function generateToc() {
  // 匹配所有 mdx 文件
  const baseDir = path.join(__dirname, '../content');
  const allFiles = await fg(path.join(baseDir, '**/*.mdx'));

  // 仅 latest：排除顶层版本快照目录（如 4.14、4.15 等以 \d+\.\d+ 开头的目录）
  const latestFiles = allFiles.filter((file) => {
    const top = path.relative(baseDir, file).split(path.sep)[0];
    return !/^\d+\.\d+/.test(top);
  });

  // 筛选中英文文件
  const zhFiles = latestFiles.filter(isZhFile);
  const enFiles = latestFiles.filter(isEnFile);

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
