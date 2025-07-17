import fs from 'fs-extra';
import path from 'path';

// 从 mdx 文件中读取 weight
async function getWeightFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const weightMatch = content.match(/weight:\s*(\d+)/);
  return weightMatch ? parseInt(weightMatch[1], 10) : 0;
}

// 从 meta.json 中读取最小 weight（用于子目录）
async function getWeightFromMeta(dir) {
  const metaPath = path.join(dir, 'meta.json');
  if (!(await fs.pathExists(metaPath))) return Infinity;

  try {
    const meta = await fs.readJson(metaPath);
    const pages = meta.pages || [];
    let minWeight = Infinity;

    for (const pageName of pages) {
      const mdxPath = path.join(dir, `${pageName}.mdx`);
      if (await fs.pathExists(mdxPath)) {
        const w = await getWeightFromFile(mdxPath);
        if (w < minWeight) minWeight = w;
      }
    }
    return minWeight === Infinity ? 0 : minWeight;
  } catch {
    return 0;
  }
}

// 主函数，返回当前目录的最小 weight
async function generateMetaRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subWeight = await generateMetaRecursive(fullPath);
      items.push({ name: entry.name, weight: subWeight });
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.mdx') &&
      !entry.name.endsWith('.en.mdx')
    ) {
      const nameWithoutExt = entry.name.replace(/\.mdx$/, '');
      const weight = await getWeightFromFile(fullPath);
      items.push({ name: nameWithoutExt, weight });
    }
  }

  // 排序 pages
  items.sort((a, b) => a.weight - b.weight);
  const pages = items.map((item) => item.name);

  // 读取或创建 meta.json
  const metaPath = path.join(dir, 'meta.json');
  let meta = {
    title: 'FastGPT',
    description: 'FastGPT Docs',
  };

  if (await fs.pathExists(metaPath)) {
    try {
      meta = await fs.readJson(metaPath);
    } catch {
      console.warn(`⚠️ Failed to parse existing meta.json at ${metaPath}, using defaults.`);
    }
  }

  meta.pages = pages;

  // 写入 meta.json，格式化为一行的 pages
  const jsonString = JSON.stringify(meta, null, 2);
  const oneLinePages = `"pages": ${JSON.stringify(pages)}`;
  const finalJson = jsonString.replace(/"pages": \[[\s\S]*?\]/, oneLinePages);
  await fs.writeFile(metaPath, finalJson, 'utf-8');
  console.log(`✅ Updated meta.json in ${dir}`);

  return items.length > 0 ? items[0].weight : 0;
}

// 启动
const targetDir = './content/docs/introduction/development/upgrading';

generateMetaRecursive(targetDir)
  .then(() => console.log('🎉 All meta.json files generated/updated!'))
  .catch((err) => console.error(err));
