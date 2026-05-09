/**
 * @file 检测英文词条中是否存在中文
 */
const fs = require('fs');
const path = require('path');

const enDir = path.join(__dirname, '../../packages/web/i18n/en');
// 正确的中文字符范围（所有范围都用 \u{} 语法以支持辅助平面字符）
const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\uf900-\ufaff\u{2f800}-\u{2fa1f}]/u;

function findChineseInObject(obj, prefix = '') {
  const results = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (chineseRegex.test(value)) {
        results.push({ key: fullKey, value });
      }
    } else if (typeof value === 'object' && value !== null) {
      results.push(...findChineseInObject(value, fullKey));
    }
  }
  return results;
}

const files = fs.readdirSync(enDir).filter(f => f.endsWith('.json'));
let totalCount = 0;

for (const file of files) {
  const filePath = path.join(enDir, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const found = findChineseInObject(content);
  if (found.length > 0) {
    console.log(`\n[${file}] 发现 ${found.length} 个中文词条:`);
    for (const { key, value } of found) {
      console.log(`  ${key}: "${value}"`);
    }
    totalCount += found.length;
  }
}

if (totalCount === 0) {
  console.log('未发现任何中文词条，所有英文词条检查通过。');
} else {
  console.log(`\n总计发现 ${totalCount} 个中文词条。`);
}
