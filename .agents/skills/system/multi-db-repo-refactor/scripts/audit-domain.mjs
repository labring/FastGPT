#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  discoverMongoSchemas,
  extractDefineIndexes,
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
  node audit-domain.mjs --list [--json]
  node audit-domain.mjs --model <MongoModelName> [--include-tests] [--json]
  node audit-domain.mjs --schema <path/to/schema.ts> [--include-tests] [--json]`);
  process.exit(0);
}

const repoRoot = findRepoRoot();
const includeTests = hasFlag('--include-tests');
const jsonOutput = hasFlag('--json');

const RISK_PATTERNS = [
  { label: 'aggregate', regex: /\.aggregate\s*[<(]/ },
  { label: 'bulkWrite', regex: /\.bulkWrite\s*\(/ },
  { label: 'findOneAndUpdate', regex: /\.findOneAndUpdate\s*\(/ },
  { label: 'sort', regex: /\.sort\s*\(/ },
  { label: 'watch', regex: /\.watch\s*\(/ },
  { label: 'mongoSessionRun', regex: /\bmongoSessionRun\b/ },
  { label: 'ClientSession', regex: /\bClientSession\b/ },
  { label: '$elemMatch', regex: /\$elemMatch\b/ },
  { label: '$regex', regex: /\$regex\b/ },
  { label: '$inc', regex: /\$inc\b/ },
  { label: 'bitmask', regex: /\$(?:bitsAllSet|bitsAnySet)\b/ },
  { label: 'cursor', regex: /\.cursor\s*\(/ }
];

const scanModelCallers = (modelNames, schemaRelPath) => {
  const searchDirs = ['packages', 'projects', 'pro/admin/src'];
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
      callerMap.set(posix, new Set());
    }
    const risks = callerMap.get(posix);
    for (const rule of RISK_PATTERNS) {
      if (rule.regex.test(text)) {
        risks.add(rule.label);
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
      const escapedSuffix = importSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        ['-l', `from\\s+['"]\\./${localBase}['"]`, parentDir, '--glob', '*.{ts,tsx}'],
        repoRoot
      );
      for (const file of localOut.split('\n').filter(Boolean)) {
        const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        recordHit(file, content);
      }
    }
  }

  return [...callerMap.entries()]
    .map(([file, risks]) => ({ file, risks: [...risks].sort() }))
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
  const entries = [];

  for (const schema of schemas) {
    const callers = scanModelCallers(schema.modelNames, schema.relPath);
    const proCount = callers.filter((c) => c.file.startsWith('pro/')).length;
    const allRisks = [...new Set(callers.flatMap((c) => c.risks))].sort();
    entries.push({
      models: schema.modelNames,
      schema: schema.relPath,
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

  entries.sort((a, b) => b.totalCallers - a.totalCallers);

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

  console.log(`Pending legacy schemas: ${entries.length}`);
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
      hasTtl: /\bexpireAfterSeconds\b/.test(content),
      indexes: extractDefineIndexes(content),
      modelNames: [
        ...content.matchAll(/export\s+(?:const|function)\s+(Mongo[A-Z][A-Za-z0-9_]*)\b/g)
      ].map((m) => m[1])
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

  console.error('Provide --list, --model <MongoName>, or --schema <path>');
  process.exit(1);
})();

const callers = scanModelCallers(target.modelNames, target.relPath);
const content = fs.readFileSync(path.join(repoRoot, target.relPath), 'utf8');
const hasWatch = /\.watch\s*\(/.test(content);
const wipDomains = findWipIncompleteDomains(repoRoot);

const report = {
  wipDomains,
  schema: target.relPath,
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
    key: i.keySummary
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
  console.log(`  ${tag} ${idx.key}${idx.name ? ` (name=${idx.name})` : ''}`);
}

console.log(`\nCaller Files (${report.callers.length}):`);
for (const caller of report.callers) {
  const riskTag = caller.risks.length > 0 ? `  [${caller.risks.join(', ')}]` : '';
  console.log(`  - ${caller.file}${riskTag}`);
}
