const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// ✅ 设置要处理的根目录（可修改为你的文档目录）
const rootDir = path.resolve(__dirname, 'content/docs');

// ✅ 仅保留的 frontmatter 字段
const KEEP_FIELDS = ['title', 'description'];

function cleanFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(raw);

  // 仅保留需要的字段
  const newData = {};
  for (const key of KEEP_FIELDS) {
    if (parsed.data[key] !== undefined) {
      newData[key] = parsed.data[key];
    }
  }

  const cleaned = matter.stringify(parsed.content, newData);
  fs.writeFileSync(filePath, cleaned, 'utf-8');
  console.log(`✔ Cleaned: ${path.relative(rootDir, filePath)}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath); // 🔁 递归子目录
    } else if (entry.endsWith('.mdx')) {
      cleanFrontmatter(fullPath);
    }
  }
}

// 🚀 开始执行
walk(rootDir);
