const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 获取文件的 git 最后修改时间
 * @param {string} filePath - 文件路径
 * @returns {string|null} - 最后修改时间（ISO 格式）或 null
 */

function getFileLastModifiedTime(filePath) {
  try {
    // 使用 git log 获取文件的最后修改时间
    const command = `git log -1 --format="%aI" -- "${filePath}"`;
    const result = execSync(command, {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return result.trim() || null;
  } catch (error) {
    console.warn(`无法获取文件 ${filePath} 的 git 信息:`, error.message);
    return null;
  }
}

/**
 * 递归获取目录下所有文档文件
 * @param {string} dirPath - 目录路径
 * @param {string[]} extensions - 文件扩展名数组
 * @returns {string[]} - 文件路径数组
 */
function getAllDocFiles(dirPath, extensions = ['.md', '.mdx']) {
  const files = [];

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // 跳过 node_modules 和 .git 目录
        if (item !== 'node_modules' && item !== '.git' && !item.startsWith('.')) {
          traverse(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  traverse(dirPath);
  return files;
}

/**
 * 获取所有文档的最新修改时间
 * @param {string} contentDir - 文档内容目录
 * @returns {Object} - 文件路径到修改时间的映射
 */
function getAllDocLastModifiedTimes(contentDir = './document/content/docs') {
  const docFiles = getAllDocFiles(contentDir);
  const result = {};

  console.log(`正在处理 ${docFiles.length} 个文档文件...`);

  for (const filePath of docFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    const lastModified = getFileLastModifiedTime(relativePath);

    if (lastModified) {
      result[relativePath] = lastModified;
    }

    // 显示进度
    process.stdout.write('.');
  }

  console.log('\n完成！');
  return result;
}

/**
 * 将结果保存到 JSON 文件
 * @param {Object} data - 要保存的数据
 * @param {string} outputPath - 输出文件路径
 */
function saveToJsonFile(data, outputPath = './document/data/doc-last-modified.json') {
  try {
    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`结果已保存到: ${outputPath}`);
  } catch (error) {
    console.error('保存文件失败:', error.message);
  }
}

/**
 * 获取单个文件的详细信息
 * @param {string} filePath - 文件路径
 * @returns {Object} - 文件信息对象
 */
function getFileInfo(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  const lastModified = getFileLastModifiedTime(relativePath);
  const stat = fs.statSync(filePath);

  return {
    path: relativePath,
    lastModified,
    size: stat.size,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString()
  };
}

/**
 * 主函数 - 获取所有文档的最新修改时间并保存
 */
function main() {
  console.log('开始获取文档的最新修改时间...');

  let contentDir = process.argv[2];

  // 如果没有传参数，或者传入的是文件而非目录，就使用默认目录
  if (!contentDir || !fs.existsSync(contentDir) || !fs.statSync(contentDir).isDirectory()) {
    contentDir = './document/content/docs';
  }

  if (!fs.existsSync(contentDir)) {
    console.error(`目录不存在: ${contentDir}`);
    process.exit(1);
  }

  const result = getAllDocLastModifiedTimes(contentDir);

  // 保存简单的文件路径到修改时间的映射
  saveToJsonFile(result, './document/data/doc-last-modified.json');

  // 显示统计信息
  console.log('\n统计信息:');
  console.log(`- 总文件数: ${Object.keys(result).length}`);
  console.log(`- 成功获取时间: ${Object.values(result).filter(Boolean).length}`);
  console.log(`- 失败文件数: ${Object.values(result).filter((v) => !v).length}`);

  // 显示最近修改的文件
  const recentFiles = Object.entries(result)
    .filter(([, time]) => time)
    .sort(([, a], [, b]) => new Date(b) - new Date(a))
    .slice(0, 5);

  if (recentFiles.length > 0) {
    console.log('\n最近修改的文件:');
    recentFiles.forEach(([file, time]) => {
      console.log(`- ${file}: ${new Date(time).toLocaleString()}`);
    });
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = {
  getFileLastModifiedTime,
  getAllDocFiles,
  getAllDocLastModifiedTimes,
  getFileInfo,
  saveToJsonFile
};
