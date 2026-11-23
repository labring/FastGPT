#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeMongoSchemaDatasource,
  discoverMongoSchemas,
  extractDefineIndexes,
  extractExportedModelNames,
  findRepoRoot,
  findWipIncompleteDomains,
  isMigrationFile,
  isTestFile,
  isTestOrMigrationFile,
  OUT_OF_SQL_SCOPE_SCHEMAS,
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
  node audit-domain.mjs --list [--asc] [--max-callers <N>] [--area <substr>] [--include-legacy-only] [--json]
  node audit-domain.mjs --model <MongoModelName> [--usages] [--include-tests] [--json]
  node audit-domain.mjs --schema <path/to/schema.ts> [--usages] [--include-tests] [--json]`);
  process.exit(0);
}

const repoRoot = findRepoRoot();
const includeTests = hasFlag('--include-tests');
const includeLegacyOnly = hasFlag('--include-legacy-only');
const showUsages = hasFlag('--usages');
const sortAsc = hasFlag('--asc');
const maxCallersRaw = getFlagValue('--max-callers');
const maxCallers = maxCallersRaw !== undefined ? Number(maxCallersRaw) : undefined;
const areaFilter = getFlagValue('--area')?.toLowerCase();
const jsonOutput = hasFlag('--json');

const RISK_PATTERNS = [
  { label: 'aggregate', regex: /\.aggregate\s*[<(]/ },
  { label: '$lookup', regex: /\$lookup\b/ },
  { label: 'bulkWrite', regex: /\.bulkWrite\s*\(/ },
  { label: 'findOneAndUpdate', regex: /\.findOneAndUpdate\s*\(/ },
  {
    label: 'sort',
    regex: /\.(?:find|findOne|findOneAndUpdate|aggregate)\b[\s\S]{0,200}?\.sort\s*\(|\bsort\s*:\s*\{/
  },
  { label: 'watch', regex: /\.watch\s*\(/ },
  { label: 'mongoSessionRun', regex: /\bmongoSessionRun\b/ },
  { label: 'ClientSession', regex: /\bClientSession\b/ },
  { label: '$elemMatch', regex: /\$elemMatch\b|arrayFilters\b/ },
  { label: '$push/$pull', regex: /\$(?:push|pull|addToSet)\b/ },
  { label: '$regex', regex: /\$regex\b/ },
  { label: '$inc', regex: /\$inc\b/ },
  { label: 'bitmask', regex: /\$(?:bitsAllSet|bitsAnySet)\b/ },
  { label: 'cursor', regex: /\.cursor\s*\(/ }
];

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 提取单个调用方文件中与目标模型关联的关键调用行片段（含跨行链式方法上下文），减少 Agent 逐文件打开次数。 */
const extractUsageSnippets = ({ content, fileRel, tokens, schemaBase }) => {
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

const scanModelCallers = ({
  modelNames,
  schemaRelPath,
  collectUsages = false,
  onlyTests = false
}) => {
  const searchDirs = ['packages', 'projects', 'pro/admin/src', 'pro/admin/test', 'test'].filter(
    (d) => fs.existsSync(path.join(repoRoot, d))
  );
  const tokens = [...modelNames];
  const schemaBase = schemaRelPath ? schemaRelPath.replace(/\.ts$/, '') : undefined;

  const callerMap = new Map();

  const recordHit = (fileRel, text) => {
    const posix = toPosixPath(fileRel);
    if (posix === schemaRelPath) {
      return;
    }
    if (onlyTests) {
      if (!isTestFile(posix) || isMigrationFile(posix)) {
        return;
      }
    } else if (!includeTests && isTestOrMigrationFile(posix)) {
      return;
    }
    if (!callerMap.has(posix)) {
      callerMap.set(posix, {
        risks: new Set(),
        usages: collectUsages
          ? extractUsageSnippets({ content: text, fileRel: posix, tokens, schemaBase })
          : undefined
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
  const outOfScopeSchemas = allSchemas.filter((s) => !s.isMigrated && s.mongoLegacyOnly);
  const pendingSchemas = allSchemas.filter((s) => !s.isMigrated && !s.mongoLegacyOnly);
  const tokenRoots = ['packages/dal/db/repos', 'packages/service', 'pro/admin/src'].filter((d) =>
    fs.existsSync(path.join(repoRoot, d))
  );
  const tokenHitsRaw =
    tokenRoots.length > 0
      ? runRg(['-l', 'defineRepoToken\\s*[<(]', ...tokenRoots, '--glob', '*.ts'], repoRoot)
      : '';
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
          outOfSqlScopeSchemas: outOfScopeSchemas.map((s) => s.relPath),
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
  if (outOfScopeSchemas.length > 0) {
    console.log(
      `Out-of-SQL-Scope Legacy : ${outOfScopeSchemas.length} (${outOfScopeSchemas.map((s) => s.relPath).join(', ')})`
    );
  }
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
  const schemas = discoverMongoSchemas(repoRoot).filter(
    (s) => !s.isMigrated && (includeLegacyOnly || !s.mongoLegacyOnly)
  );
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

    const callers = scanModelCallers({
      modelNames: schema.modelNames,
      schemaRelPath: schema.relPath
    });
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
      mongoLegacyOnly: OUT_OF_SQL_SCOPE_SCHEMAS.has(normalized),
      datasource: analyzeMongoSchemaDatasource({
        sourceText: content,
        repoRoot,
        sourceRelPath: normalized
      }).datasource,
      hasSoftDelete: /\bdeleteTime\b/.test(content),
      hasTtl: /\bexpireAfterSeconds\b|\bexpires\s*:/.test(content),
      indexes: extractDefineIndexes(content, { repoRoot, sourceRelPath: normalized }),
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

const callers = scanModelCallers({
  modelNames: target.modelNames,
  schemaRelPath: target.relPath,
  collectUsages: showUsages
});
const affectedTestFiles = scanModelCallers({
  modelNames: target.modelNames,
  schemaRelPath: target.relPath,
  onlyTests: true
}).map((item) => item.file);
const content = fs.readFileSync(path.join(repoRoot, target.relPath), 'utf8');
const hasWatch = /\.watch\s*\(/.test(content);
const wipDomains = findWipIncompleteDomains(repoRoot);

/** 根据表特征和调用面高危算子，自动生成本切片必须额外补齐的测试清单。 */
const buildRecommendedExtraTests = ({ schemaMeta, callerItems, testFiles }) => {
  const recs = [
    'L1/L2 多方言契约测试（OB/MySQL + PG DDL 编译、6 项同构契约 + 真实事务回滚/afterCommit）',
    'L0 Service 纯内存单测（构造函数注入 Stub Repo，覆盖非平凡业务编排，零 DB/零 vi.mock）'
  ];
  const risks = new Set(callerItems.flatMap((c) => c.risks));

  if (schemaMeta.datasource === 'log') {
    recs.push(
      '日志库双态路由测试（覆盖默认 shared 回退复用主池可读写、separate 独立日志库隔离且主库无数据）'
    );
  }
  if (schemaMeta.hasSoftDelete) {
    recs.push('软删除隔离测试（deleteTime 非空记录对常规读/改不可见，delete_time_ms=0 唯一哨兵约束）');
  }
  if (schemaMeta.hasTtl) {
    recs.push('TTL 过期读过滤测试（已过期记录对读路径不可见、未过期记录正常返回）');
  }
  if (risks.has('findOneAndUpdate') || risks.has('$inc') || risks.has('bulkWrite')) {
    recs.push(
      '并发抢占/原子扣减/冲突重试测试（验证 FOR UPDATE SKIP LOCKED 或 CAS 不重复/不超扣、重试不重复跑 afterCommit）'
    );
  }
  if (risks.has('sort')) {
    recs.push('排序边界测试（若含可空排序列，必须覆盖带值与 NULL 混合行在 PG/OB/Mongo 顺序一致）');
  }
  if (risks.has('$regex')) {
    recs.push('大小写对照测试（等值与唯一键区分大小写对齐 utf8mb4_bin；caseInsensitiveLike 正确转义 %/_/|）');
  }
  if (risks.has('cursor')) {
    recs.push('Keyset 游标分批迭代测试（多批无漏行、无重行、空集安全终止）');
  }
  if (risks.has('bitmask')) {
    recs.push('权限位运算掩码边界测试（0、单 bit、复合 bit、全命中/部分命中）');
  }
  if (risks.has('$lookup')) {
    recs.push('跨表关联策略验证（简单补全改批量 IN 组装；复杂过滤建只读 Query Repo 并测分页一致性）');
  }
  if (testFiles.length > 0) {
    recs.push(
      `存量测试夹具脱 Mongo 迁移与回归（共 ${testFiles.length} 个测试文件引用旧 Model，收口前全部改走 Repo/Service）`
    );
  }

  return recs;
};

const recommendedExtraTests = target.mongoLegacyOnly
  ? ['[OUT-OF-SQL-SCOPE] 仅 Mongo GridFS 历史兼容读取，SQL 模式返回空/404，不建 SQL 表']
  : buildRecommendedExtraTests({
      schemaMeta: target,
      callerItems: callers,
      testFiles: affectedTestFiles
    });

const report = {
  wipDomains,
  schema: target.relPath,
  mongoLegacyOnly: Boolean(target.mongoLegacyOnly),
  siblingSchemas,
  models: target.modelNames,
  datasource: target.datasource,
  hasSoftDelete: target.hasSoftDelete,
  hasTtl: target.hasTtl,
  hasWatch,
  sliceStrategy: target.mongoLegacyOnly
    ? 'out-of-sql-scope-mongo-legacy'
    : callers.length > 20
      ? 'super-table-micro-slices'
      : '1-slice-full-cutover',
  indexes: target.indexes.map((i) => ({
    name: i.name,
    deprecated: i.deprecated,
    key: i.keySummary,
    options: i.criticalOptions
  })),
  totalCallers: callers.length,
  proCallers: callers.filter((c) => c.file.startsWith('pro/')).length,
  affectedTestFiles,
  recommendedExtraTests,
  callers
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('=== Domain Refactor Audit Brief ===');
if (report.mongoLegacyOnly) {
  console.log(
    'ℹ️  [OUT-OF-SQL-SCOPE] Mongo GridFS legacy only — do NOT create SQL tables; SQL mode returns empty/404.'
  );
}
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
  `Datasource   : ${report.datasource}${report.datasource === 'log' ? ' (two-state: defaults to shared fallback on main pool; switches to separate pool when logWriteUrl is configured)' : ''}`
);
console.log(
  `Flags        : softDelete=${report.hasSoftDelete}, ttl=${report.hasTtl}, watch=${report.hasWatch}`
);
console.log(
  `Slice Mode   : ${report.sliceStrategy} (total=${report.totalCallers}, pro=${report.proCallers}, testFiles=${report.affectedTestFiles.length})`
);
console.log(`\nIndexes (${report.indexes.length}):`);
for (const idx of report.indexes) {
  const tag = idx.deprecated ? '[DEPRECATED]' : '[ACTIVE]    ';
  const optsText =
    Object.keys(idx.options).length > 0 ? ` options=${JSON.stringify(idx.options)}` : '';
  console.log(`  ${tag} ${idx.key}${idx.name ? ` (name=${idx.name})` : ''}${optsText}`);
}

console.log(`\nRecommended Extra Tests (${report.recommendedExtraTests.length}):`);
for (const item of report.recommendedExtraTests) {
  console.log(`  - ${item}`);
}

if (report.affectedTestFiles.length > 0) {
  console.log(`\nAffected Test Files to Decouple (${report.affectedTestFiles.length}):`);
  for (const tf of report.affectedTestFiles.slice(0, 15)) {
    console.log(`  - ${tf}`);
  }
  if (report.affectedTestFiles.length > 15) {
    console.log(`  ... and ${report.affectedTestFiles.length - 15} more (pass --include-tests to inspect)`);
  }
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
