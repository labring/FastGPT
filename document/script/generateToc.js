const fs = require('node:fs/promises');
const path = require('node:path');
const fg = require('fast-glob');
const matter = require('gray-matter');

// 假设 i18n.defaultLanguage = 'zh-CN'，这里不用 i18n 直接写两份逻辑即可

// 黑名单路径（不带语言前缀）
const blacklist = [
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

/** 为当前版本已发布的中英文页面生成目录，排除版本快照、草稿及索引页本身。 */
async function generateToc() {
  // 匹配所有 mdx 文件
  const baseDir = path.join(__dirname, '../content');
  const allFiles = await fg(path.join(baseDir, '**/*.mdx'));

  // 仅 latest：排除顶层版本快照目录（如 4.14、4.15 等以 \d+\.\d+ 开头的目录）
  const latestFiles = allFiles.filter((file) => {
    const top = path.relative(baseDir, file).split(path.sep)[0];
    return !/^\d+\.\d+/.test(top);
  });

  // 目录导出同样排除未发布页面，不因文件仍在仓库而重新加入草稿链接。
  const publishedFiles = (
    await Promise.all(
      latestFiles.map(async (file) => {
        const { data } = matter(await fs.readFile(file, 'utf8'));
        return data.draft === true ? undefined : file;
      })
    )
  ).filter(Boolean);

  // 筛选中英文文件
  const zhFiles = publishedFiles.filter(isZhFile);
  const enFiles = publishedFiles.filter(isEnFile);

  // 生成中文 URL
  const zhUrls = zhFiles
    .map((file) => filePathToUrl(file, 'zh-CN'))
    .filter((url) => !isBlacklisted(url))
    .sort();

  // 生成英文 URL
  const enUrls = enFiles
    .map((file) => filePathToUrl(file, 'en'))
    .filter((url) => !isBlacklisted(url))
    .map((url) => url.replace(/\/index$/, ''))
    .sort();

  const makeMdxContent = (urls, title, isChinese = true) =>
    `---
title: ${title}
description: ${isChinese ? 'FastGPT 文档目录' : 'Browse the FastGPT documentation by topic.'}
---

${urls.map((url) => `- [${url}](${url})`).join('\n')}
`;

  // 写文件路径
  const zhOutputPath = path.join(baseDir, 'toc.mdx');
  const enOutputPath = path.join(baseDir, 'toc.en.mdx');

  // 写入文件
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(zhOutputPath, makeMdxContent(zhUrls, 'FastGPT 文档目录', true), 'utf8');
  await fs.writeFile(enOutputPath, makeMdxContent(enUrls, 'FastGPT Documentation Index', false), 'utf8');

  console.log(`✅ 写入中文目录 ${zhOutputPath}`);
  console.log(`✅ 写入英文目录 ${enOutputPath}`);
}

generateToc().catch(console.error);
