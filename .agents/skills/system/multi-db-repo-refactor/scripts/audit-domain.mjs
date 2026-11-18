#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  discoverMongoSchemas,
  extractDefineIndexes,
  extractExportedModelNames,
  findRepoRoot,
  findWipIncompleteDomains,
  isTestOrMigrationFile,
  runRg,
  toPosixPath
} from './common.mjs';

const args = process.argv.slice(2);

const getFlagValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return undefined;
  }
  return args[idx + 1];
};

const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h') || args.length === 0) {
  console.log(`Usage:
  node audit-domain.mjs --status [--json]
  node audit-domain.mjs --list [--asc] [--max-callers <N>] [--area <substr>] [--json]
  node audit-domain.mjs --model <MongoModelName> [--usages] [--include-tests] [--json]
  node audit-domain.mjs --schema <path/to/schema.ts> [--usages] [--include-tests] [--json]`);
  process.exit(0);
}

const repoRoot = findRepoRoot();
const includeTests = hasFlag('--include-tests');
const showUsages = hasFlag('--usages');
const sortAsc = hasFlag('--asc');
const maxCallersRaw = getFlagValue('--max-callers');
const maxCallers = maxCallersRaw !== undefined ? Number(maxCallersRaw) : undefined;
const areaFilter = getFlagValue('--area')?.toLowerCase();
const jsonOutput = hasFlag('--json');

const RISK_PATTERNS = [
  { label: 'aggregate', regex: /\.aggregate\s*[<(]/ },
  { label: 'bulkWrite', regex: /\.bulkWrite\s*\(/ },
  { label: 'findOneAndUpdate', regex: /\.findOneAndUpdate\s*\(/ },
  {
    label: 'sort',
    regex: /\.(?:find|findOne|findOneAndUpdate|aggregate)\b[\s\S]{0,200}?\.sort\s*\(|\bsort\s*:\s*\{/
  },
  { label: 'watch', regex: /\.watch\s*\(/ },
  { label: 'mongoSessionRun', regex: /\bmongoSessionRun\b/ },
  { label: 'ClientSession', regex: /\bClientSession\b/ },
  { label: '$elemMatch', regex: /\$elemMatch\b/ },
  { label: '$regex', regex: /\$regex\b/ },
  { label: '$inc', regex: /\$inc\b/ },
  { label: 'bitmask', regex: /\$(?:bitsAllSet|bitsAnySet)\b/ },
  { label: 'cursor', regex: /\.cursor\s*\(/ }
];

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 提取单个调用方文件中与目标模型关联的关键调用行片段（含跨行链式方法上下文），减少 Agent 逐文件打开次数。 */
const extractUsageSnippets = (content, fileRel, tokens, schemaBase) => {
  const tokenMatchers = tokens.map((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`));
  const importMatchers = [];
  if (schemaBase !== undefined) {
    const segs = schemaBase.split('/');
    const importSuffix = segs.slice(-3).join('/');
    if (importSuffix.includes('/')) {
      importMatchers.push(new RegExp(`from\\s+['"][^'"]*/${escapeRegExp(importSuffix)}['"]`));
    }
    if (path.posix.dirname(fileRel) === path.posix.dirname(schemaBase)) {
      const localBase = path.posix.basename(schemaBase);
      importMatchers.push(new RegExp(`from\\s+['"]\\./${escapeRegExp(localBase)}['"]`));
    }
  }
  if (tokenMatchers.length === 0 && importMatchers.length === 0) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const importSnippets = [];
  const callSnippets = [];
  const MAX_CALL_SNIPPETS = 10;

  for (let i = 0; i < lines.length && callSnippets.length < MAX_CALL_SNIPPETS; i += 1) {
    const line = lines[i];
    const matchedToken = tokenMatchers.some((re) => re.test(line));
    const matchedImport = importMatchers.some((re) => re.test(line));
    if (!matchedToken && !matchedImport) {
      continue;
    }

    const trimmed = line.trim();
    const isImportLine = /^import\b/.test(trimmed) || /\bfrom\s+['"]/.test(trimmed);
    if (isImportLine) {
      if (importSnippets.length < 2) {
        importSnippets.push(`L${i + 1}: ${trimmed}`);
      }
      continue;
    }

    let combined = `L${i + 1}: ${trimmed}`;
    // 若链式调用在下一行展开（如 `await MongoXxx\n  .findOne(...)`），拼接最多 3 行上下文以展示完整查询算子
    if (!/[;]$/.test(trimmed)) {
      for (let offset = 1; offset <= 3 && i + offset < lines.length; offset += 1) {
        const nextTrimmed = lines[i + offset].trim();
        if (nextTrimmed.length === 0) break;
        combined += ` ${nextTrimmed}`;
        if (/[;]$/.test(nextTrimmed)) break;
      }
    }

    callSnippets.push(combined.length > 200 ? `${combined.slice(0, 197)}...` : combined);
  }

  return [...importSnippets, ...callSnippets];
};

const scanModelCallers = (modelNames, schemaRelPath, { collectUsages = false } = {}) => {
  const searchDirs = ['packages', 'projects', 'pro/admin/src'].filter((d) =>
    fs.existsSync(path.join(repoRoot, d))
  );
  const tokens = [...modelNames];
  const schemaBase = schemaRelPath ? schemaRelPath.replace(/\.ts$/, '') : undefined;

  const callerMap = new Map();

  const recordHit = (fileRel, text) => {
    const posix = toPosixPath(fileRel);
    if (posix === schemaRelPath) {
      return;
    }
    if (!includeTests && isTestOrMigrationFile(posix)) {
      return;
    }
    if (!callerMap.has(posix)) {
      callerMap.set(posix, {
        risks: new Set(),
        usages: collectUsages ? extractUsageSnippets(text, posix, tokens, schemaBase) : undefined
      });
    }
    const entry = callerMap.get(posix);
    for (const rule of RISK_PATTERNS) {
      if (rule.regex.test(text)) {
        entry.risks.add(rule.label);
      }
    }
  };

  for (const token of tokens) {
    const out = runRg(
      ['-l', '--word-regexp', token, ...searchDirs, '--glob', '*.{ts,tsx}'],
      repoRoot
    );
    for (const file of out.split('\n').filter(Boolean)) {
      const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      recordHit(file, content);
    }
  }

  // 同时按带父目录的 3 段路径后缀及同目录相对导入精确匹配，避免不同域的 model/schema 误撞
  if (schemaBase !== undefined) {
    const segs = schemaBase.split('/');
    const importSuffix = segs.slice(-3).join('/');
    if (importSuffix.length > 0 && importSuffix.includes('/')) {
      const escapedSuffix = escapeRegExp(importSuffix);
      const out = runRg(
        ['-l', `from\\s+['"][^'"]*/${escapedSuffix}['"]`, ...searchDirs, '--glob', '*.{ts,tsx}'],
        repoRoot
      );
      for (const file of out.split('\n').filter(Boolean)) {
        const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        recordHit(file, content);
      }
    }

    const parentDir = path.posix.dirname(schemaBase);
    const localBase = path.posix.basename(schemaBase);
    if (fs.existsSync(path.join(repoRoot, parentDir))) {
      const localOut = runRg(
        ['-l', `from\\s+['"]\\./${escapeRegExp(localBase)}['"]`, parentDir, '--glob', '*.{ts,tsx}'],
        repoRoot
      );
      for (const file of localOut.split('\n').filter(Boolean)) {
        const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        recordHit(file, content);
      }
    }
  }

  return [...callerMap.entries()]
    .map(([file, info]) => ({
      file,
      risks: [...info.risks].sort(),
      ...(info.usages !== undefined ? { usages: info.usages } : {})
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
};

const classifySchemaArea = (relPath) => {
  const parts = relPath.split('/');
  if (relPath.startsWith('packages/service/')) {
    return parts.slice(2, 4).join('/') || 'packages/service';
  }
  if (relPath.startsWith('pro/admin/src/')) {
    return 'pro/' + (parts[3] ?? 'other');
  }
  return parts.slice(0, 2).join('/');
};

if (hasFlag('--status')) {
  const wipDomains = findWipIncompleteDomains(repoRoot);
  const allSchemas = discoverMongoSchemas(repoRoot);
  const migratedSchemas = allSchemas.filter((s) => s.isMigrated);
  const pendingSchemas = allSchemas.filter((s) => !s.isMigrated);
  const tokenHitsRaw = runRg(
    ['-l', 'define(?:Log)?RepoToken\\s*[<(]', 'packages/service', 'pro/admin/src', '--glob', '*.ts'],
    repoRoot
  );
  const migratedRepoTokens = tokenHitsRaw ? tokenHitsRaw.split('\n').filter(Boolean) : [];

  const areaCounts = new Map();
  for (const schema of pendingSchemas) {
    const area = classifySchemaArea(schema.relPath);
    areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  }
  const sortedAreas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          migratedRepoTokens: migratedRepoTokens.length,
          migratedSchemas: migratedSchemas.length,
          pendingLegacySchemas: pendingSchemas.length,
          wipIncompleteDomains: wipDomains,
          pendingByArea: Object.fromEntries(sortedAreas)
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  console.log('=== Multi-DB Repository Refactor Progress ===');
  console.log(`Migrated DI Repo Tokens : ${migratedRepoTokens.length}`);
  console.log(`Migrated Schema Files   : ${migratedSchemas.length}`);
  console.log(`Pending Legacy Schemas  : ${pendingSchemas.length}`);
  console.log(`WIP=1 Unclosed Domains  : ${wipDomains.length}`);

  if (wipDomains.length > 0) {
    console.log('\n⚠️  WIP=1 Lock Active (finish deleting legacy schemas below before starting new tables):');
    for (const wip of wipDomains) {
      console.log(`   - ${wip.dir} :: ${wip.legacySchemas.join(', ')}`);
    }
  }

  if (sortedAreas.length > 0) {
    console.log('\nPending Legacy Schemas by Area:');
    for (const [area, count] of sortedAreas.slice(0, 20)) {
      console.log(`  ${String(count).padStart(4)}  ${area}`);
    }
    if (sortedAreas.length > 20) {
      console.log(`  ... and ${sortedAreas.length - 20} more areas`);
    }
  }
  process.exit(0);
}

if (hasFlag('--list')) {
  const wipDomains = findWipIncompleteDomains(repoRoot);
  const schemas = discoverMongoSchemas(repoRoot).filter((s) => !s.isMigrated);
  let entries = [];

  for (const schema of schemas) {
    const area = classifySchemaArea(schema.relPath);
    if (
      areaFilter &&
      !schema.relPath.toLowerCase().includes(areaFilter) &&
      !area.toLowerCase().includes(areaFilter)
    ) {
      continue;
    }

    const callers = scanModelCallers(schema.modelNames, schema.relPath);
    if (maxCallers !== undefined && Number.isFinite(maxCallers) && callers.length > maxCallers) {
      continue;
    }

    const proCount = callers.filter((c) => c.file.startsWith('pro/')).length;
    const allRisks = [...new Set(callers.flatMap((c) => c.risks))].sort();
    entries.push({
      models: schema.modelNames,
      schema: schema.relPath,
      area,
      datasource: schema.datasource,
      totalCallers: callers.length,
      proCallers: proCount,
      sliceMode: callers.length > 20 ? 'super-table' : '1-slice',
      hasSoftDelete: schema.hasSoftDelete,
      hasTtl: schema.hasTtl,
      indexCount: schema.indexes.length,
      risks: allRisks
    });
  }

  entries.sort((a, b) => {
    const diff = sortAsc ? a.totalCallers - b.totalCallers : b.totalCallers - a.totalCallers;
    if (diff !== 0) return diff;
    return a.schema.localeCompare(b.schema);
  });

  if (jsonOutput) {
    console.log(JSON.stringify({ wipDomains, totalPendingSchemas: entries.length, entries }, null, 2));
    process.exit(0);
  }

  if (wipDomains.length > 0) {
    console.log('⚠️  WIP=1 LOCK ACTIVE (finish these in-flight domains before starting new tables):');
    for (const wip of wipDomains) {
      console.log(`   - ${wip.dir} (remaining legacy: ${wip.legacySchemas.join(', ')})`);
    }
    console.log('');
  }

  console.log(`Pending legacy schemas matching filter: ${entries.length}`);
  console.log('MODE         TOTAL  PRO   DS    IDX  MODEL(S) :: SCHEMA');
  console.log('-'.repeat(92));
  for (const item of entries) {
    const mode = item.sliceMode.padEnd(11);
    const total = String(item.totalCallers).padStart(5);
    const pro = String(item.proCallers).padStart(4);
    const ds = item.datasource.padEnd(4);
    const idx = String(item.indexCount).padStart(3);
    const names = item.models.join(', ') || '(unnamed)';
    console.log(`${mode} ${total} ${pro}  ${ds}  ${idx}  ${names} :: ${item.schema}`);
  }
  process.exit(0);
}

const modelArg = getFlagValue('--model');
const schemaArg = getFlagValue('--schema');
const catalog = discoverMongoSchemas(repoRoot);

const target = (() => {
  if (schemaArg !== undefined) {
    const normalized = toPosixPath(schemaArg).replace(/^\.\//, '');
    const found = catalog.find((item) => item.relPath === normalized);
    if (found !== undefined) {
      return found;
    }
    const abs = path.resolve(repoRoot, normalized);
    if (!fs.existsSync(abs)) {
      console.error(`Schema file not found: ${normalized}`);
      process.exit(1);
    }
    const content = fs.readFileSync(abs, 'utf8');
    return {
      relPath: normalized,
      isMigrated: normalized.endsWith('/mongo/schema.ts'),
      datasource: /\bgetMongoLogModel\b/.test(content) ? 'log' : 'main',
      hasSoftDelete: /\bdeleteTime\b/.test(content),
      hasTtl: /\bexpireAfterSeconds\b|\bexpires\s*:/.test(content),
      indexes: extractDefineIndexes(content),
      modelNames: extractExportedModelNames(content)
    };
  }

  if (modelArg !== undefined) {
    const found = catalog.find((item) => item.modelNames.includes(modelArg));
    if (found === undefined) {
      console.error(`Model "${modelArg}" not found in discovered schema files.`);
      process.exit(1);
    }
    return found;
  }

  console.error('Provide --status, --list, --model <MongoName>, or --schema <path>');
  process.exit(1);
})();

const domainDirAbs = path.dirname(path.join(repoRoot, target.relPath));
const siblingSchemas = catalog
  .filter(
    (item) =>
      !item.isMigrated &&
      item.relPath !== target.relPath &&
      path.dirname(path.join(repoRoot, item.relPath)) === domainDirAbs
  )
  .map((item) => ({ schema: item.relPath, models: item.modelNames }));

const callers = scanModelCallers(target.modelNames, target.relPath, { collectUsages: showUsages });
const content = fs.readFileSync(path.join(repoRoot, target.relPath), 'utf8');
const hasWatch = /\.watch\s*\(/.test(content);
const wipDomains = findWipIncompleteDomains(repoRoot);

const report = {
  wipDomains,
  schema: target.relPath,
  siblingSchemas,
  models: target.modelNames,
  datasource: target.datasource,
  requiresNoopRepo: target.datasource === 'log',
  hasSoftDelete: target.hasSoftDelete,
  hasTtl: target.hasTtl,
  hasWatch,
  sliceStrategy: callers.length > 20 ? 'super-table-micro-slices' : '1-slice-full-cutover',
  indexes: target.indexes.map((i) => ({
    name: i.name,
    deprecated: i.deprecated,
    key: i.keySummary,
    options: i.criticalOptions
  })),
  totalCallers: callers.length,
  proCallers: callers.filter((c) => c.file.startsWith('pro/')).length,
  callers
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('=== Domain Refactor Audit Brief ===');
if (wipDomains.length > 0) {
  console.log(`⚠️  WIP=1 Lock Active: ${wipDomains.map((w) => w.dir).join(', ')}`);
}
console.log(`Schema       : ${report.schema}`);
console.log(`Model(s)     : ${report.models.join(', ')}`);
if (siblingSchemas.length > 0) {
  console.log(
    `Sibling(s)   : ${siblingSchemas.map((s) => `${s.schema} [${s.models.join(', ')}]`).join('; ')}  (decide 1:1 sub-dirs vs merged domain before scaffolding!)`
  );
}
console.log(
  `Datasource   : ${report.datasource}${report.requiresNoopRepo ? ' (MUST create noop/repo.ts + defineLogRepoToken!)' : ''}`
);
console.log(
  `Flags        : softDelete=${report.hasSoftDelete}, ttl=${report.hasTtl}, watch=${report.hasWatch}`
);
console.log(
  `Slice Mode   : ${report.sliceStrategy} (total=${report.totalCallers}, pro=${report.proCallers})`
);
console.log(`\nIndexes (${report.indexes.length}):`);
for (const idx of report.indexes) {
  const tag = idx.deprecated ? '[DEPRECATED]' : '[ACTIVE]    ';
  const optsText =
    Object.keys(idx.options).length > 0 ? ` options=${JSON.stringify(idx.options)}` : '';
  console.log(`  ${tag} ${idx.key}${idx.name ? ` (name=${idx.name})` : ''}${optsText}`);
}

console.log(`\nCaller Files (${report.callers.length}):`);
for (const caller of report.callers) {
  const riskTag = caller.risks.length > 0 ? `  [${caller.risks.join(', ')}]` : '';
  console.log(`  - ${caller.file}${riskTag}`);
  if (caller.usages) {
    for (const snippet of caller.usages) {
      console.log(`      ${snippet}`);
    }
  }
}
