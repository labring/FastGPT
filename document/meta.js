import fs from 'fs-extra';
import path from 'path';

async function generateMeta(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const pages = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      pages.push(entry.name);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.mdx') &&
      !entry.name.endsWith('.en.mdx')
    ) {
      const nameWithoutExt = entry.name.replace(/\.mdx$/, '');
      pages.push(nameWithoutExt);
    }
  }

  const metaPath = path.join(dir, 'meta.json');

  // 使用 JSON.stringify，spaces设为2，数组不换行
  // 通过 replacer 参数实现“pages”数组一行
  const jsonString = JSON.stringify(
    { pages },
    (key, value) => {
      if (key === 'pages') {
        return value; // 保持pages数组原样
      }
      return value;
    },
    2
  );

  // 手动替换 pages 数组换行，变成一行显示
  const oneLinePages = `"pages": ${JSON.stringify(pages)}`;
  const finalJson = jsonString.replace(
    /"pages": \[[^\]]*\]/,
    oneLinePages
  );

  await fs.writeFile(metaPath, finalJson, 'utf-8');
  console.log(`Generated meta.json in ${dir}`);

  // 递归处理子目录
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await generateMeta(path.join(dir, entry.name));
    }
  }
}

const targetDir = './content/docs/development/openapi';

generateMeta(targetDir)
  .then(() => console.log('All meta.json files generated!'))
  .catch((err) => console.error(err));
