#!/usr/bin/env node
/**
 * 组件使用指南生成脚本
 *
 * 功能：
 *   1. 扫描 projects/app/src/components 和 packages/web/components 下所有组件文件的修改时间
 *   2. 计算修改时间 Hash，与 SKILL.md frontmatter 中记录的 snapshot_hash 对比
 *   3. 若不一致，重新扫描组件信息并将快照写入 component-snapshot.md
 *
 * 用法：
 *   node .claude/skills/common/skills/component-guide/gen-component-guide.mjs          # 自动检测变更后更新
 *   node .claude/skills/common/skills/component-guide/gen-component-guide.mjs --force  # 强制重新生成
 *   node .claude/skills/common/skills/component-guide/gen-component-guide.mjs --check  # 仅检查是否需要更新
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// 脚本位于 .claude/skills/common/skills/component-guide/，向上 5 级为项目根目录
const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL_DIR, '../../../../..');

// ─── 配置 ────────────────────────────────────────────────────────────────────

const SCAN_DIRS = [
  'projects/app/src/components',
  'packages/web/components'
];

const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md');
const SNAPSHOT_FILE = path.join(SKILL_DIR, 'component-snapshot.md');

const INCLUDE_EXTS = ['.tsx', '.ts'];

// Icon 子目录为纯图标资源、d.ts 为类型声明，跳过
const EXCLUDE_PATTERNS = [
  /\/Icon\/icons\//,
  /\.d\.ts$/,
  /__tests__/
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function walkDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (INCLUDE_EXTS.includes(ext)) {
        const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
        if (!EXCLUDE_PATTERNS.some((p) => p.test(relPath))) {
          results.push(fullPath);
        }
      }
    }
  }
  return results;
}

/**
 * 计算文件列表的修改时间 Hash（用于快速变更检测）
 */
function computeSnapshotHash(files) {
  const entries = files
    .sort()
    .map((f) => {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      const mtime = fs.statSync(f).mtimeMs;
      return `${rel}:${mtime}`;
    })
    .join('\n');
  return crypto.createHash('md5').update(entries).digest('hex');
}

/**
 * 从 SKILL.md 的 frontmatter 中提取 snapshot_hash
 */
function readSkillHash() {
  if (!fs.existsSync(SKILL_FILE)) return '';
  const content = fs.readFileSync(SKILL_FILE, 'utf8');
  const match = content.match(/^snapshot_hash:\s*"?([^"\n]*)"?/m);
  return match ? match[1].trim() : '';
}

/**
 * 更新 SKILL.md frontmatter 中的 snapshot_hash 和 snapshot_updated_at
 */
function updateSkillFrontmatter(hash) {
  let content = fs.readFileSync(SKILL_FILE, 'utf8');
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  content = content.replace(
    /^snapshot_hash:\s*"?[^"\n]*"?/m,
    `snapshot_hash: "${hash}"`
  );
  content = content.replace(
    /^snapshot_updated_at:\s*"?[^"\n]*"?/m,
    `snapshot_updated_at: "${now}"`
  );
  fs.writeFileSync(SKILL_FILE, content, 'utf8');
}

/**
 * 从 .tsx 文件中提取基本信息（组件名、导出的 Props 类型、顶部注释）
 */
function extractComponentInfo(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');

  // 提取导出的类型/接口名
  const exportTypes = [];
  for (const m of content.matchAll(/^export\s+(?:type|interface)\s+(\w+)/gm)) {
    exportTypes.push(m[1]);
  }

  // 提取默认导出的组件名
  let componentName = '';
  const defaultExportMatch =
    content.match(/export\s+default\s+(?:React\.memo\()?(?:forwardRef\()?(\w+)/) ||
    content.match(/const\s+(\w+)\s*[=:][^;]+\n.*export\s+default/s);
  if (defaultExportMatch) {
    componentName = defaultExportMatch[1];
  }
  if (!componentName) {
    componentName = path.basename(filePath, path.extname(filePath));
    if (componentName === 'index') {
      componentName = path.basename(path.dirname(filePath));
    }
  }

  // 提取文件顶部 /** ... */ 注释
  let description = '';
  const blockComment = content.match(/^\/\*\*\s*\n([\s\S]*?)\*\//);
  if (blockComment) {
    description = blockComment[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ')
      .substring(0, 100);
  }

  return { componentName, relPath, description, exportTypes };
}

/**
 * 生成 component-snapshot.md 的完整内容
 */
function buildSnapshotMarkdown(files, hash) {
  const updatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // 按 4 级目录分组
  const groups = {};
  for (const f of files) {
    const info = extractComponentInfo(f);
    const dir = path.dirname(info.relPath).split('/').slice(0, 4).join('/');
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(info);
  }

  let md = `# 组件快照（自动生成）\n\n`;
  md += `> **请勿手动编辑此文件**，由 \`gen-component-guide.mjs\` 脚本自动维护。\n`;
  md += `> 最后更新：${updatedAt}  |  Hash：\`${hash.substring(0, 8)}\`\n\n`;

  const sortedDirs = Object.keys(groups).sort();
  for (const dir of sortedDirs) {
    const items = groups[dir];
    md += `## \`${dir}/\`\n\n`;
    md += `| 组件 | 文件 | 导出类型 | 说明 |\n`;
    md += `|------|------|----------|------|\n`;
    for (const item of items) {
      const fileBasename = path.basename(item.relPath);
      const types = item.exportTypes.slice(0, 3).join(', ') || '-';
      const desc = item.description || '-';
      md += `| \`${item.componentName}\` | \`${fileBasename}\` | \`${types}\` | ${desc} |\n`;
    }
    md += `\n`;
  }

  return md;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const forceUpdate = args.includes('--force');
  const checkOnly = args.includes('--check');

  console.log('📦 FastGPT 组件使用指南生成工具\n');
  console.log(`📂 项目根目录：${ROOT}`);
  console.log(`📂 扫描目录：`);
  SCAN_DIRS.forEach((d) => console.log(`   ${d}`));
  console.log('');

  // 1. 收集所有组件文件
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    walkDir(path.join(ROOT, dir), allFiles);
  }
  console.log(`🔍 发现组件文件：${allFiles.length} 个`);

  // 2. 计算当前快照 Hash
  const currentHash = computeSnapshotHash(allFiles);
  console.log(`🔑 当前快照 Hash：${currentHash.substring(0, 8)}...`);

  // 3. 读取已记录的 Hash
  const recordedHash = readSkillHash();
  if (recordedHash) {
    console.log(`📝 记录快照 Hash：${recordedHash.substring(0, 8)}...`);
  } else {
    console.log(`📝 记录快照 Hash：（无记录，首次生成）`);
  }

  // 4. 判断是否需要更新
  if (!forceUpdate && currentHash === recordedHash) {
    console.log('\n✅ 组件库无变化，跳过更新。可使用 --force 强制重新生成。');
    return;
  }

  if (checkOnly) {
    console.log('\n⚠️  检测到变更，但运行于 --check 模式，未修改文件。');
    console.log(
      '   请运行 node .claude/skills/common/skills/component-guide/gen-component-guide.mjs 来更新指南。'
    );
    process.exit(1);
  }

  console.log('\n🔄 检测到变更，正在更新组件指南...');

  // 5. 生成并写入 component-snapshot.md
  const snapshotMd = buildSnapshotMarkdown(allFiles, currentHash);
  fs.writeFileSync(SNAPSHOT_FILE, snapshotMd, 'utf8');
  console.log(`   ✓ 写入 component-snapshot.md（${allFiles.length} 个组件）`);

  // 6. 更新 SKILL.md frontmatter
  updateSkillFrontmatter(currentHash);
  console.log(`   ✓ 更新 SKILL.md 快照 Hash`);

  console.log(`\n✅ 更新完成！`);
  console.log(`   新快照 Hash：${currentHash.substring(0, 8)}...`);
  console.log(`\n💡 出码前请阅读 component-api.md 中的组件使用指南。`);
}

main().catch((e) => {
  console.error('❌ 脚本执行失败：', e.message);
  process.exit(1);
});
