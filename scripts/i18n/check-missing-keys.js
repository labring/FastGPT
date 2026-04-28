#!/usr/bin/env node
'use strict';

/**
 * 扫描源代码中使用的 i18n key，检查 zh-CN 中是否存在对应词条
 *
 * 用法:
 *   node scripts/i18n/check-missing-keys.js [--fix-hint]
 *
 * 说明:
 *   - 扫描 packages/ 和 projects/ 下所有 .ts/.tsx/.js/.jsx 文件
 *   - 提取 t('namespace:key') 形式的翻译调用
 *   - 检查 packages/web/i18n/zh-CN/<namespace>.json 中是否有对应 key
 *   - 输出所有缺失词条
 */

const fs = require('fs');
const path = require('path');

// ---- 配置 ----
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const I18N_ZH_CN_DIR = path.join(PROJECT_ROOT, 'packages', 'web', 'i18n', 'zh-CN');
const SCAN_DIRS = ['projects/app/src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  'out',
  '.cache'
]);

// ---- 参数 ----
const args = process.argv.slice(2);
const SHOW_HINT = args.includes('--fix-hint');

// ---- 加载 zh-CN 词条 ----
/**
 * @returns {Map<string, Set<string>>} namespace -> Set<key>
 */
function loadZhCNKeys() {
  const nsMap = new Map();

  if (!fs.existsSync(I18N_ZH_CN_DIR)) {
    console.error(`❌ zh-CN 目录不存在: ${I18N_ZH_CN_DIR}`);
    process.exit(1);
  }

  for (const file of fs.readdirSync(I18N_ZH_CN_DIR)) {
    if (!file.endsWith('.json')) continue;
    const ns = file.replace(/\.json$/, '');
    const filePath = path.join(I18N_ZH_CN_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      nsMap.set(ns, new Set(Object.keys(data)));
    } catch (e) {
      console.warn(`⚠️  解析失败: ${filePath} - ${e.message}`);
    }
  }

  return nsMap;
}

// ---- 扫描源文件 ----
/**
 * 递归收集所有源文件路径
 * @param {string} dir
 * @returns {string[]}
 */
function collectFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * 从文件内容中提取所有静态翻译 key
 * 匹配形式: t('ns:key') / t("ns:key") / t(`ns:key`)
 * 也匹配无 namespace: t('key') / t("key")
 * @param {string} content
 * @returns {{ ns: string|null, key: string }[]}
 */
function extractKeys(content) {
  const found = [];

  // 匹配 t( 后紧跟的静态字符串参数（单引号/双引号）
  // 不匹配模板字符串（动态 key 无法静态分析）
  const re = /\bt\(\s*(['"])([^'"\\`\n]+?)\1/g;
  let m;

  while ((m = re.exec(content)) !== null) {
    const raw = m[2].trim();
    const colonIdx = raw.indexOf(':');
    if (colonIdx > 0) {
      // namespace:key 格式
      const ns = raw.slice(0, colonIdx);
      const key = raw.slice(colonIdx + 1);
      // 跳过 ns 或 key 包含空格/换行等明显非 i18n key 的情况
      // ns 必须以字母开头（过滤数字 namespace、URL 路径等）
      if (ns && key && /^[a-zA-Z]/.test(ns) && !/\s/.test(ns) && !/\s/.test(key) && !/^[/]/.test(key)) {
        found.push({ ns, key });
      }
    }
    // 无 namespace 的情况暂不检查（默认 namespace 难以确定）
  }

  return found;
}

// ---- 主逻辑 ----
function main() {
  console.log('🔍 扫描源代码中缺失的 zh-CN i18n 词条...\n');

  const zhCNKeys = loadZhCNKeys();

  // 收集所有源文件
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...collectFiles(path.join(PROJECT_ROOT, dir)));
  }

  console.log(`📁 扫描文件数: ${allFiles.length}`);
  console.log(`📦 zh-CN 命名空间数: ${zhCNKeys.size}\n`);

  // key: "ns:key", value: Set<filePath>
  const missing = new Map();

  for (const filePath of allFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const keys = extractKeys(content);

    for (const { ns, key } of keys) {
      const nsKeys = zhCNKeys.get(ns);
      const exists = nsKeys != null && nsKeys.has(key);

      if (!exists) {
        const id = `${ns}:${key}`;
        if (!missing.has(id)) missing.set(id, new Set());
        missing.get(id).add(path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'));
      }
    }
  }

  if (missing.size === 0) {
    console.log('✅ 所有 zh-CN 词条均已存在，未发现缺失！');
    return;
  }

  // 按 namespace 分组输出
  const byNs = new Map();
  for (const [id, files] of missing) {
    const [ns, ...rest] = id.split(':');
    const key = rest.join(':');
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push({ key, files });
  }

  let total = 0;
  for (const [ns, items] of [...byNs.entries()].sort()) {
    const nsFile = `packages/web/i18n/zh-CN/${ns}.json`;
    const fileExists = fs.existsSync(path.join(PROJECT_ROOT, nsFile));
    const fileStatus = fileExists ? '' : ' (⚠️ 文件不存在)';

    console.log(`📄 ${nsFile}${fileStatus}  (${items.length} 个缺失)`);

    for (const { key, files } of items.sort((a, b) => a.key.localeCompare(b.key))) {
      console.log(`  ❌ "${key}"`);
      if (SHOW_HINT) {
        for (const f of files) {
          console.log(`       引用于: ${f}`);
        }
      }
      total++;
    }

    console.log('');
  }

  console.log(`\n📊 合计缺失: ${total} 个词条，涉及 ${byNs.size} 个命名空间`);
  console.log('💡 提示: 使用 --fix-hint 参数可查看每个缺失词条的引用文件');

  process.exit(1);
}

main();
