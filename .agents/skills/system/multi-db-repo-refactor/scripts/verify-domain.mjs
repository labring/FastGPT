#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractDefineIndexes,
  findRepoRoot,
  readGitHeadFile,
  toPosixPath
} from './common.mjs';

const args = process.argv.slice(2);

const getFlagValues = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return [];
  }
  const values = [];
  for (let i = idx + 1; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      break;
    }
    values.push(args[i]);
  }
  return values;
};

const getFlagValue = (flag) => getFlagValues(flag)[0];
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h') || args.length === 0) {
  console.log(`Usage:
  node verify-domain.mjs --dir <domain-dir> [--legacy-schema <path>] [--git-legacy <git-head-path>] [--test <test-file...>] [--allow-wip-slice1]`);
  process.exit(0);
}

const dirArg = getFlagValue('--dir');
if (!dirArg) {
  console.error('Missing required flag: --dir <domain-dir>');
  process.exit(1);
}

const repoRoot = findRepoRoot();
const domainRel = toPosixPath(dirArg).replace(/^\.\//, '').replace(/\/$/, '');
const domainAbs = path.resolve(repoRoot, domainRel);
const allowWipSlice1 = hasFlag('--allow-wip-slice1');
const legacySchemaArg = getFlagValue('--legacy-schema');
const gitLegacyArg = getFlagValue('--git-legacy');
const testTargets = getFlagValues('--test');

if (!fs.existsSync(domainAbs)) {
  console.error(`Domain directory does not exist: ${domainRel}`);
  process.exit(1);
}

const failures = [];
const warnings = [];
const checkFileExists = (rel) => fs.existsSync(path.join(domainAbs, rel));

// 1. 目录结构完整性检查
const requiredFiles = [
  'repo.type.ts',
  'mongo/schema.ts',
  'mongo/repo.ts',
  'sql/table.ts',
  'sql/repo.ts',
  'repo.ts'
];
for (const rel of requiredFiles) {
  if (!checkFileExists(rel)) {
    failures.push(`[Structure] Missing required file: ${domainRel}/${rel}`);
  }
}

const repoTsPath = path.join(domainAbs, 'repo.ts');
const repoTsText = fs.existsSync(repoTsPath) ? fs.readFileSync(repoTsPath, 'utf8') : '';
if (/\bdefineLogRepoToken\b/.test(repoTsText) && !checkFileExists('noop/repo.ts')) {
  failures.push(`[Structure] defineLogRepoToken requires ${domainRel}/noop/repo.ts`);
}

// 2. defineIndex 零丢失比对（防止迁移漏掉历史 deprecated 索引）
const mongoSchemaPath = path.join(domainAbs, 'mongo/schema.ts');
const legacySource = (() => {
  if (legacySchemaArg !== undefined) {
    const abs = path.resolve(repoRoot, legacySchemaArg);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  }
  if (gitLegacyArg !== undefined) {
    return readGitHeadFile(repoRoot, toPosixPath(gitLegacyArg).replace(/^\.\//, ''));
  }
  return null;
})();

if (legacySource !== null && fs.existsSync(mongoSchemaPath)) {
  const oldIndexes = extractDefineIndexes(legacySource);
  const newIndexes = extractDefineIndexes(fs.readFileSync(mongoSchemaPath, 'utf8'));
  const toSignature = (idx) => `${idx.deprecated ? 'DEP' : 'ACT'}:${idx.keySummary}`;
  const newSigs = new Set(newIndexes.map(toSignature));

  for (const oldIdx of oldIndexes) {
    const sig = toSignature(oldIdx);
    if (!newSigs.has(sig)) {
      failures.push(`[Indexes] Missing defineIndex from legacy schema: ${sig}`);
    }
  }
} else if (legacySchemaArg === undefined && gitLegacyArg === undefined) {
  warnings.push('[Indexes] Neither --legacy-schema nor --git-legacy provided; skipped index diff check');
}

// 3. 收口检查（确认旧 schema.ts 已清理）
if (!allowWipSlice1) {
  const siblingLegacySchemas = fs
    .readdirSync(domainAbs, { withFileTypes: true })
    .filter((e) => e.isFile() && /schema\.ts$/i.test(e.name))
    .map((e) => `${domainRel}/${e.name}`);

  if (siblingLegacySchemas.length > 0) {
    failures.push(
      `[Closure] Legacy schema still exists in ${domainRel} (${siblingLegacySchemas.join(', ')}); pass --allow-wip-slice1 only during Slice 1`
    );
  }
}

// 4. 运行契约与业务测试
if (testTargets.length > 0) {
  try {
    console.log(`Running targeted tests: ${testTargets.join(' ')}`);
    execFileSync('pnpm', ['test', ...testTargets], {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  } catch {
    failures.push(`[Tests] Targeted tests failed: ${testTargets.join(' ')}`);
  }
} else {
  warnings.push('[Tests] No --test target specified; skipped test execution');
}

for (const w of warnings) {
  console.log(`⚠️  ${w}`);
}

if (failures.length > 0) {
  console.error(`\n❌ Domain verification FAILED (${failures.length} issue(s)):`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`\n✅ Domain verification PASSED for ${domainRel}`);
