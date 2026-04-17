/*
    检查 public/imgs 里的图片，是否均在 content 下的 mdx 使用，移除没用到的图片。
*/

const fs = require('fs');
const path = require('path');

const DOCUMENT_ROOT = path.resolve(__dirname, '..');
const IMGS_DIR = path.join(DOCUMENT_ROOT, 'public', 'imgs');
const CONTENT_DIR = path.join(DOCUMENT_ROOT, 'content');

const IMG_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dirPath, extensions) {
  const files = [];

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile()) {
        if (!extensions || extensions.has(path.extname(item).toLowerCase())) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(dirPath);
  return files;
}

/**
 * 获取 public/imgs 下所有图片文件，返回相对于 public/imgs 的路径集合
 */
function getAllImageFiles() {
  const imgFiles = getAllFiles(IMGS_DIR, IMG_EXTENSIONS);
  return imgFiles.map((filePath) => ({
    absolutePath: filePath,
    // 相对于 imgs 目录的路径，如 "image-1.png" 或 "guide/team_permissions/1.png"
    relativePath: path.relative(IMGS_DIR, filePath)
  }));
}

/**
 * 获取所有 mdx/md 文件内容
 */
function getAllDocContents() {
  const docFiles = getAllFiles(CONTENT_DIR, new Set(['.md', '.mdx']));
  return docFiles.map((filePath) => ({
    filePath,
    content: fs.readFileSync(filePath, 'utf-8')
  }));
}

/**
 * 从所有文档中提取被引用的图片路径（相对于 imgs 目录）
 *
 * 支持以下引用模式:
 * 1. ![alt](/imgs/xxx.png)              - 绝对路径
 * 2. ![alt](../../../public/imgs/xxx.png) - 相对路径
 * 3. src="/imgs/xxx.png"                - HTML img 标签
 * 4. src={"/imgs/xxx.png"}              - JSX img 标签
 */
function extractReferencedImages(docContents) {
  const referencedImages = new Set();

  // 匹配模式1: ![...](/imgs/path)
  const absolutePathRegex = /!\[.*?\]\(\/imgs\/(.+?)\)/g;

  // 匹配模式2: ![...](相对路径/public/imgs/path)
  const relativePathRegex = /!\[.*?\]\((?:\.\.\/)*public\/imgs\/(.+?)\)/g;

  // 匹配模式3: src="/imgs/path" 或 src='/imgs/path'
  const srcAbsoluteRegex = /src=["']\/imgs\/(.+?)["']/g;

  // 匹配模式4: src={"/imgs/path"} 或 src={'/imgs/path'}
  const srcJsxRegex = /src=\{["']\/imgs\/(.+?)["']\}/g;

  for (const { content } of docContents) {
    for (const regex of [absolutePathRegex, relativePathRegex, srcAbsoluteRegex, srcJsxRegex]) {
      let match;
      // 每次使用前重置 lastIndex
      regex.lastIndex = 0;
      while ((match = regex.exec(content)) !== null) {
        referencedImages.add(match[1]);
      }
    }
  }

  return referencedImages;
}

/**
 * 主函数
 */
function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔍 开始扫描...');
  console.log(`   图片目录: ${IMGS_DIR}`);
  console.log(`   文档目录: ${CONTENT_DIR}`);
  console.log(`   模式: ${dryRun ? '预览（不删除）' : '删除无效图片'}\n`);

  // 1. 获取所有图片
  const allImages = getAllImageFiles();
  console.log(`📁 共发现 ${allImages.length} 个图片文件`);

  // 2. 获取所有文档内容
  const docContents = getAllDocContents();
  console.log(`📄 共发现 ${docContents.length} 个文档文件`);

  // 3. 提取被引用的图片
  const referencedImages = extractReferencedImages(docContents);
  console.log(`🔗 共发现 ${referencedImages.size} 个图片引用\n`);

  // 4. 找出未被引用的图片
  const unusedImages = allImages.filter(
    (img) => !referencedImages.has(img.relativePath.replace(/\\/g, '/'))
  );

  if (unusedImages.length === 0) {
    console.log('✅ 所有图片均被文档引用，无需清理！');
    return;
  }

  console.log(`⚠️  发现 ${unusedImages.length} 个未被引用的图片:\n`);

  // 按目录分组显示
  const grouped = {};
  for (const img of unusedImages) {
    const dir = path.dirname(img.relativePath) || '.';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(path.basename(img.relativePath));
  }

  for (const [dir, files] of Object.entries(grouped).sort()) {
    const dirLabel = dir === '.' ? '(根目录)' : dir;
    console.log(`  📂 ${dirLabel}/`);
    for (const file of files.sort()) {
      console.log(`     - ${file}`);
    }
  }

  console.log('');

  // 5. 删除未被引用的图片
  if (dryRun) {
    console.log('ℹ️  预览模式，未执行删除。使用不带 --dry-run 参数运行以删除。');
  } else {
    let deletedCount = 0;
    let totalSize = 0;

    for (const img of unusedImages) {
      try {
        const stat = fs.statSync(img.absolutePath);
        totalSize += stat.size;
        fs.unlinkSync(img.absolutePath);
        deletedCount++;
      } catch (err) {
        console.error(`   ❌ 删除失败: ${img.relativePath} - ${err.message}`);
      }
    }

    // 清理空目录
    cleanEmptyDirs(IMGS_DIR);

    const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`🗑️  已删除 ${deletedCount} 个图片，释放 ${sizeMB} MB 空间`);
  }

  // 6. 输出统计
  console.log('\n📊 统计:');
  console.log(`   总图片数:     ${allImages.length}`);
  console.log(`   已引用图片数: ${allImages.length - unusedImages.length}`);
  console.log(`   未引用图片数: ${unusedImages.length}`);
  console.log(
    `   使用率:       ${(((allImages.length - unusedImages.length) / allImages.length) * 100).toFixed(1)}%`
  );
}

/**
 * 递归清理空目录
 */
function cleanEmptyDirs(dirPath) {
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanEmptyDirs(fullPath);
    }
  }

  // 再次检查是否为空
  if (fs.readdirSync(dirPath).length === 0 && dirPath !== IMGS_DIR) {
    fs.rmdirSync(dirPath);
    console.log(`   🗂️  清理空目录: ${path.relative(IMGS_DIR, dirPath)}/`);
  }
}

main();
