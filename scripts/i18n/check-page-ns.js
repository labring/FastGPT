#!/usr/bin/env node
/**
 * 检查页面使用的 i18n 命名空间是否在 getServerSideProps 中完整声明
 *
 * 用法：
 *   # 全量扫描（默认）
 *   node scripts/i18n/check-page-ns.js
 *
 *   # 排除符合正则的页面（路径相对于 pages 目录，可多次使用）
 *   node scripts/i18n/check-page-ns.js --exclude "login|price"
 *   node scripts/i18n/check-page-ns.js --exclude "login" --exclude "price"
 *
 *   # 仅检查单个页面
 *   node scripts/i18n/check-page-ns.js projects/app/src/pages/account/apikey.tsx
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── 常量 ────────────────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(__dirname, '../..');
const PAGES_DIR = path.join(ROOT_DIR, 'projects/app/src/pages');
const APP_SRC_DIR = path.join(ROOT_DIR, 'projects/app/src');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

// 路径别名 → 实际目录映射（顺序：更长的前缀优先）
const PATH_ALIASES = [
  { prefix: '@/', target: APP_SRC_DIR + path.sep },
  { prefix: '@fastgpt/web/', target: path.join(PACKAGES_DIR, 'web') + path.sep },
  { prefix: '@fastgpt/global/', target: path.join(PACKAGES_DIR, 'global') + path.sep },
  { prefix: '@fastgpt/service/', target: path.join(PACKAGES_DIR, 'service') + path.sep },
  { prefix: '@fastgpt/plugins/', target: path.join(PACKAGES_DIR, 'plugins') + path.sep },
];

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

// 全量扫描时排除的 Next.js 保留文件
const NEXT_RESERVED_RE = /[/\\]_/; // 以 _ 开头的文件，如 _app.tsx _document.tsx

// serviceSideProps 在 projects/app/src/web/common/i18n/utils.ts 中默认加载的命名空间
// 修改 utils.ts 中的默认列表时，需同步更新此处
const GLOBAL_DEFAULT_NS = ['common', 'app', 'account', 'account_info'];

// ── 路径解析 ────────────────────────────────────────────────────────────────

function resolveFilePath(importPath, fromFile) {
  let base;

  if (importPath.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), importPath);
  } else {
    const alias = PATH_ALIASES.find((a) => importPath.startsWith(a.prefix));
    if (!alias) return null; // 外部 npm 包，跳过
    base = alias.target + importPath.slice(alias.prefix.length).replace(/\//g, path.sep);
  }

  // 1. 直接命中（已含扩展名）
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;

  // 2. 猜扩展名
  for (const ext of EXTENSIONS) {
    const p = base + ext;
    if (fs.existsSync(p)) return p;
  }

  // 3. index 文件
  for (const ext of EXTENSIONS) {
    const p = path.join(base, 'index' + ext);
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ── 文件级提取（带缓存） ──────────────────────────────────────────────────────

const _contentCache = new Map(); // filePath → string
const _importsCache = new Map(); // filePath → string[]
const _nsCache = new Map();      // filePath → Map<ns, filePath>

function readFile(filePath) {
  if (!_contentCache.has(filePath)) {
    _contentCache.set(filePath, fs.readFileSync(filePath, 'utf-8'));
  }
  return _contentCache.get(filePath);
}

// 提取静态 import + next/dynamic 动态 import 路径
function extractImports(filePath) {
  if (_importsCache.has(filePath)) return _importsCache.get(filePath);

  const content = readFile(filePath);
  const results = [];

  // 静态 import（含 type import）
  const staticRe = /^import\s+(?:type\s+)?(?:[\w\s{},*]+)\s+from\s+['"`]([^'"`\n]+)['"`]/gm;
  let m;
  while ((m = staticRe.exec(content)) !== null) results.push(m[1]);

  // dynamic(() => import('path'))
  const dynRe1 =
    /dynamic\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = dynRe1.exec(content)) !== null) results.push(m[1]);

  // dynamic(() => import('path').then(...))
  const dynRe2 =
    /dynamic\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.then/g;
  while ((m = dynRe2.exec(content)) !== null) results.push(m[1]);

  const unique = [...new Set(results)];
  _importsCache.set(filePath, unique);
  return unique;
}

// 提取单文件自身使用的命名空间（不含子树）
// 返回 Map<ns, { file: string, keys: Set<string> }>
function extractOwnNamespaces(filePath) {
  if (_nsCache.has(filePath)) return _nsCache.get(filePath);

  const content = readFile(filePath);
  // Map<ns, { file, keys }>
  const found = new Map();

  const ensureNs = (ns) => {
    if (!ns || ns === 'common') return null;
    if (!found.has(ns)) found.set(ns, { file: filePath, keys: new Set() });
    return found.get(ns);
  };

  // t('namespace:key') — 捕获完整 key（支持嵌套点、连字符）
  const tRe = /\bt\s*\(\s*['"`]([\w-]+:([\w./-]+))['"`]/g;
  let m;
  while ((m = tRe.exec(content)) !== null) {
    const entry = ensureNs(m[1].split(':')[0]);
    if (entry) entry.keys.add(m[1]);
  }

  // useTranslation('namespace') — 只知道 ns，无具体 key
  const utSingleRe = /useTranslation\s*\(\s*['"`]([\w-]+)['"`]\s*\)/g;
  while ((m = utSingleRe.exec(content)) !== null) ensureNs(m[1]);

  // useTranslation(['ns1', 'ns2', ...])
  const utArrayRe = /useTranslation\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  while ((m = utArrayRe.exec(content)) !== null) {
    const nsRe = /['"`]([\w-]+)['"`]/g;
    let nm;
    while ((nm = nsRe.exec(m[1])) !== null) ensureNs(nm[1]);
  }

  _nsCache.set(filePath, found);
  return found;
}

// 从页面文件提取 serviceSideProps 声明的命名空间
// GLOBAL_DEFAULT_NS 中的命名空间由 serviceSideProps 默认加载，无需在页面中单独声明
function extractDeclaredNamespaces(content) {
  const ns = new Set(GLOBAL_DEFAULT_NS);
  const re = /serviceSideProps\s*\([^,)]+,\s*\[([\s\S]*?)\]/;
  const m = re.exec(content);
  if (m) {
    const arrRe = /['"`]([\w-]+)['"`]/g;
    let am;
    while ((am = arrRe.exec(m[1])) !== null) ns.add(am[1]);
  }
  return ns;
}

// ── 组件树扫描 ───────────────────────────────────────────────────────────────

// 递归扫描组件树，返回整棵树使用的所有命名空间
// Map<ns, { file: string, keys: Set<string> }>
function scanComponentTree(filePath, visited = new Set(), depth = 0) {
  const MAX_DEPTH = 15;
  if (visited.has(filePath) || depth > MAX_DEPTH) return new Map();

  visited.add(filePath);
  if (!fs.existsSync(filePath)) return new Map();

  // 深拷贝当前文件的结果，避免污染缓存
  const usedNs = new Map();
  for (const [ns, { file, keys }] of extractOwnNamespaces(filePath)) {
    usedNs.set(ns, { file, keys: new Set(keys) });
  }

  for (const importPath of extractImports(filePath)) {
    const resolved = resolveFilePath(importPath, filePath);
    if (!resolved) continue;

    for (const [ns, { file, keys }] of scanComponentTree(resolved, visited, depth + 1)) {
      if (!usedNs.has(ns)) {
        usedNs.set(ns, { file, keys: new Set(keys) });
      } else {
        // 同一 ns 在多个文件中出现，合并 keys
        for (const k of keys) usedNs.get(ns).keys.add(k);
      }
    }
  }

  return usedNs;
}

// ── 单页面检查 ────────────────────────────────────────────────────────────────

// 返回 { declaredNs, missingNs: Array<[ns, { file, keys }]>, scannedCount }
function checkPage(pagePath) {
  const content = readFile(pagePath);
  const declaredNs = extractDeclaredNamespaces(content);

  const visited = new Set();
  const usedNs = scanComponentTree(pagePath, visited);
  const missingNs = [...usedNs.entries()].filter(([ns]) => !declaredNs.has(ns));

  return { declaredNs, usedNs, missingNs, scannedCount: visited.size };
}

// ── 收集页面文件 ──────────────────────────────────────────────────────────────

// 递归收集 dir 下所有页面文件（含 serviceSideProps、排除 api/ 和 _ 开头）
function collectPages(dir, excludePatterns) {
  const pages = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // 排除 api 目录
        if (entry.name === 'api') continue;
        walk(full);
      } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        // 排除 Next.js 保留文件（_app.tsx 等）
        if (NEXT_RESERVED_RE.test(full)) continue;

        const relPath = path.relative(ROOT_DIR, full).replace(/\\/g, '/');

        // 应用用户排除正则（匹配相对于 pages 目录的路径）
        const relToPages = path
          .relative(PAGES_DIR, full)
          .replace(/\\/g, '/');
        if (excludePatterns.some((re) => re.test(relToPages))) continue;

        // 只处理含 serviceSideProps 的页面（快速文本检查，不解析 AST）
        const content = fs.readFileSync(full, 'utf-8');
        if (!content.includes('serviceSideProps')) continue;

        pages.push(full);
      }
    }
  }

  walk(dir);
  return pages;
}

// ── 输出工具 ─────────────────────────────────────────────────────────────────

const DIVIDER = '─'.repeat(60);

function printSingleResult(pagePath, result) {
  const rel = path.relative(ROOT_DIR, pagePath).replace(/\\/g, '/');
  const { declaredNs, missingNs, scannedCount } = result;

  console.log(`\n🔍 检查页面: ${rel}\n`);
  console.log(`📋 已声明命名空间: ${[...declaredNs].join(', ')}`);
  console.log(`🌳 扫描了 ${scannedCount} 个文件\n`);

  if (missingNs.length === 0) {
    console.log('✅ 所有命名空间已完整声明，无问题！\n');
    return;
  }

  console.log(`❌ 发现 ${missingNs.length} 个未声明的命名空间:\n`);
  for (const [ns, { file, keys }] of missingNs) {
    const relFile = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    console.log(`   ❌ ${ns}  (使用于: ${relFile})`);
    if (keys.size > 0) {
      const keyList = [...keys].slice(0, 8);
      const more = keys.size - keyList.length;
      console.log(`      词条: ${keyList.join(', ')}${more > 0 ? ` ...等${more}个` : ''}`);
    }
  }

  const existingNs = [...declaredNs].filter((ns) => ns !== 'common');
  const suggestedNs = [...new Set([...existingNs, ...missingNs.map(([ns]) => ns)])];
  console.log(`\n💡 建议更新 getServerSideProps 为:`);
  console.log(`   ['${suggestedNs.join("', '")}']`);
  console.log('');
}

function printBatchResults(results) {
  const failed = results.filter((r) => r.missingNs.length > 0);

  console.log(`\n${DIVIDER}`);
  for (const { relPath, missingNs } of results) {
    if (missingNs.length === 0) {
      console.log(`✅  ${relPath}`);
    } else {
      console.log(`❌  ${relPath}  (缺少 ${missingNs.length} 个: ${missingNs.map(([ns]) => ns).join(', ')})`);
    }
  }
  console.log(DIVIDER);

  if (failed.length > 0) {
    console.log('\n详情：\n');
    for (const { relPath, declaredNs, missingNs } of failed) {
      console.log(`  [${relPath}]`);
      console.log(`    已声明: ${[...declaredNs].join(', ')}`);
      for (const [ns, { file, keys }] of missingNs) {
        const relFile = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
        console.log(`    ❌ ${ns}  (使用于: ${relFile})`);
        if (keys.size > 0) {
          const keyList = [...keys].slice(0, 8);
          const more = keys.size - keyList.length;
          console.log(`       词条: ${keyList.join(', ')}${more > 0 ? ` ...等${more}个` : ''}`);
        }
      }
      const existingNs = [...declaredNs].filter((ns) => ns !== 'common');
      const suggestedNs = [...new Set([...existingNs, ...missingNs.map(([ns]) => ns)])];
      console.log(`    💡 建议: ['${suggestedNs.join("', '")}']`);
      console.log('');
    }
  }

  const total = results.length;
  const ok = total - failed.length;
  const status = failed.length === 0 ? '✅' : '❌';
  console.log(`${status} 扫描完成：共 ${total} 个页面，${ok} 个通过，${failed.length} 个有问题\n`);
}

// ── 参数解析 ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const excludePatterns = [];
  let pageArg = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exclude' && argv[i + 1]) {
      try {
        excludePatterns.push(new RegExp(argv[++i]));
      } catch {
        console.error(`❌ 无效的正则表达式: ${argv[i]}`);
        process.exit(1);
      }
    } else if (!argv[i].startsWith('--')) {
      pageArg = argv[i];
    }
  }

  return { pageArg, excludePatterns };
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

function main() {
  const { pageArg, excludePatterns } = parseArgs(process.argv.slice(2));

  // 单页面模式
  if (pageArg) {
    const pagePath = path.isAbsolute(pageArg)
      ? pageArg
      : path.resolve(ROOT_DIR, pageArg);

    if (!fs.existsSync(pagePath)) {
      console.error(`❌ 文件不存在: ${pagePath}`);
      process.exit(1);
    }

    const result = checkPage(pagePath);
    printSingleResult(pagePath, result);
    process.exit(result.missingNs.length > 0 ? 1 : 0);
  }

  // 全量扫描模式
  const relPagesDir = path.relative(ROOT_DIR, PAGES_DIR).replace(/\\/g, '/');
  const excludeDesc =
    excludePatterns.length > 0
      ? `  排除规则: ${excludePatterns.map((r) => r.toString()).join(', ')}`
      : '';

  console.log(`\n🔍 全量扫描 ${relPagesDir}`);
  if (excludeDesc) console.log(excludeDesc);

  const pages = collectPages(PAGES_DIR, excludePatterns);
  console.log(`   共 ${pages.length} 个页面\n`);

  const results = pages.map((pagePath) => {
    const relPath = path
      .relative(PAGES_DIR, pagePath)
      .replace(/\\/g, '/');
    const result = checkPage(pagePath);
    return { relPath, pagePath, ...result };
  });

  printBatchResults(results);

  const hasFailed = results.some((r) => r.missingNs.length > 0);
  process.exit(hasFailed ? 1 : 0);
}

main();
