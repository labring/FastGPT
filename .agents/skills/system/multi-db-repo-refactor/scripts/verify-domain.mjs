#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeSchemaIndexes,
  analyzeSqlTableDefinitions,
  extractDefineIndexes,
  extractExportedModelNames,
  findRepoRoot,
  findSiblingLegacySchemas,
  inferDomainTestDir,
  isMigrationFile,
  isTestFile,
  isTestOrMigrationFile,
  readGitLegacyFile,
  runRg,
  stripCommentsPreserveStrings,
  stripImportsAndStrings,
  toPosixPath
} from './common.mjs';

const args = process.argv.slice(2);

const getFlagValues = (flag) => {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== flag) {
      continue;
    }
    for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j += 1) {
      values.push(args[j]);
    }
  }
  return values;
};

const getFlagValue = (flag) => getFlagValues(flag)[0];
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h') || args.length === 0) {
  console.log(`Usage:
  node verify-domain.mjs --dir <domain-dir> \\
    [--legacy-schema <path...>] \\
    [--git-legacy <[merge-base:|ref:]repo-rel-path...>] \\
    [--collection-map <oldCollection=newCollection...>] \\
    [--schema-map <OldSchemaVar=NewSchemaVar...>] \\
    [--legacy-model <MongoModelName...>] \\
    [--test <test-file...>] \\
    [--allow-wip-slice1]`);
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
const legacySchemaArgs = getFlagValues('--legacy-schema');
const gitLegacyArgs = getFlagValues('--git-legacy');
const collectionMapArgs = getFlagValues('--collection-map');
const schemaMapArgs = getFlagValues('--schema-map');
const explicitLegacyModels = getFlagValues('--legacy-model');
const testTargets = getFlagValues('--test');

if (!fs.existsSync(domainAbs)) {
  console.error(`Domain directory does not exist: ${domainRel}`);
  process.exit(1);
}

const failures = [];
const warnings = [];
const checkFileExists = (rel) => fs.existsSync(path.join(domainAbs, rel));

/** 解析 `old=new` 显式重命名映射并校验一一对应（禁止多对一合并抵消）。 */
const parseInjectivePairMap = ({ pairs, flagName }) => {
  const forward = new Map();
  const reverse = new Map();

  for (const raw of pairs) {
    const eqIdx = raw.indexOf('=');
    const from = eqIdx > 0 ? raw.slice(0, eqIdx).trim() : '';
    const to = eqIdx > 0 ? raw.slice(eqIdx + 1).trim() : '';
    if (!from || !to) {
      failures.push(`[Indexes] Invalid ${flagName} entry "${raw}" (expected <old>=<new>)`);
      continue;
    }
    if (forward.has(from) && forward.get(from) !== to) {
      failures.push(`[Indexes] Conflicting ${flagName} entries for "${from}"`);
      continue;
    }
    const prevFrom = reverse.get(to);
    if (prevFrom !== undefined && prevFrom !== from) {
      failures.push(
        `[Indexes] Non-injective ${flagName}: both "${prevFrom}" and "${from}" map to "${to}"`
      );
      continue;
    }
    forward.set(from, to);
    reverse.set(to, from);
  }

  return forward;
};

/** 提取剥离注释后源码中的静态与动态 import 模块路径。 */
const extractImportSpecifiers = (cleanCode) => {
  const specs = new Set();
  for (const match of cleanCode.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    specs.add(match[1]);
  }
  for (const match of cleanCode.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specs.add(match[1]);
  }
  return [...specs];
};

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

// 2. 领域内部分层隔离、索引声明规范与跨方言 SQL 可移植性静态检查
const checkDomainStaticBoundaries = () => {
  const readClean = (rel) => {
    const abs = path.join(domainAbs, rel);
    if (!fs.existsSync(abs)) {
      return null;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    return { raw, clean: stripCommentsPreserveStrings(raw) };
  };

  const repoType = readClean('repo.type.ts');
  if (repoType !== null) {
    for (const spec of extractImportSpecifiers(repoType.clean)) {
      if (
        /^(?:mongoose|mongodb|kysely|pg|mysql2)(?:\/|$)/.test(spec) ||
        /(?:^|\/)common\/mongo(?:\/|$)/.test(spec) ||
        /^\.\/(?:mongo|sql|noop)(?:\/|$)/.test(spec)
      ) {
        failures.push(
          `[Boundary] ${domainRel}/repo.type.ts must not import driver/dialect module "${spec}"`
        );
      }
    }
    const leaked = repoType.clean.match(/\b(?:FilterQuery|ClientSession|UpdateQuery|PipelineStage)\b/);
    if (leaked) {
      failures.push(
        `[Boundary] ${domainRel}/repo.type.ts leaks Mongoose driver type "${leaked[0]}" (use pure DTOs & DbSession)`
      );
    }
  }

  const service = readClean('service.ts');
  if (service !== null) {
    for (const spec of extractImportSpecifiers(service.clean)) {
      if (
        /^(?:mongoose|mongodb|kysely|pg|mysql2)(?:\/|$)/.test(spec) ||
        /^\.\/(?:mongo|sql|noop)(?:\/|$)/.test(spec)
      ) {
        failures.push(
          `[Boundary] ${domainRel}/service.ts must inject RepoToken instead of importing "${spec}"`
        );
      } else if (
        /(?:^|\/)common\/mongo(?:\/|$)/.test(spec) &&
        !/(?:^|\/)common\/mongo\/sessionRun$/.test(spec)
      ) {
        failures.push(
          `[Boundary] ${domainRel}/service.ts must not import "${spec}" (only temporary sessionRun bridge is allowed when coordinating unmigrated sibling domains)`
        );
      } else if (/(?:^|\/)common\/mongo\/sessionRun$/.test(spec)) {
        warnings.push(
          `[Boundary] ${domainRel}/service.ts still imports "${spec}" for mixed-domain transactions; switch to runInTransaction once sibling tables migrate`
        );
      }
    }
    const leaked = service.clean.match(/\b(?:FilterQuery|UpdateQuery|PipelineStage)\b/);
    if (leaked) {
      failures.push(`[Boundary] ${domainRel}/service.ts leaks Mongoose query type "${leaked[0]}"`);
    }
  }

  for (const sqlRel of ['sql/table.ts', 'sql/repo.ts']) {
    const sqlFile = readClean(sqlRel);
    if (sqlFile === null) {
      continue;
    }
    for (const spec of extractImportSpecifiers(sqlFile.clean)) {
      if (
        /^(?:mongoose|mongodb)(?:\/|$)/.test(spec) ||
        /(?:^|\/)common\/mongo(?:\/|$)/.test(spec) ||
        /^\.\.\/mongo(?:\/|$)/.test(spec)
      ) {
        failures.push(`[Boundary] ${domainRel}/${sqlRel} must not import Mongo module "${spec}"`);
      }
    }

    const nonPortableRules = [
      {
        regex: /\bILIKE\b|['"]ilike['"]/,
        reason: 'ILIKE is non-portable on OceanBase/MySQL; use this.caseInsensitiveLike(...)'
      },
      {
        regex: /\.\s*returning(?:All)?\s*\(|\bRETURNING\s+(?:\*|[A-Za-z_"(`])/i,
        reason: 'RETURNING is unsupported on OceanBase/MySQL; pre-generate _id via createEntityId()'
      },
      {
        regex: /\bUSING\s+(?:GIN|GIST)\b/i,
        reason: 'GIN/GIST indexes are PG-only; use portable B-Tree indexes'
      },
      {
        regex: /\bARRAY\s*\[/i,
        reason: 'PG ARRAY[] is non-portable; use JSON column with toJsonParam or child table'
      },
      {
        regex: /\bpgTable\b/,
        reason: 'pgTable is PG-only; use defineSqlTable from @fastgpt/dal/db/sql/ddl'
      },
      {
        regex: /\bjsonb_path_exists\b|\bMERGE\s+INTO\b/i,
        reason:
          'jsonb_path_exists / MERGE INTO is non-portable; use B-Tree columns or this.upsertRow(...)'
      },
      {
        regex: /\.\s*ignore\s*\(|\bINSERT\s+IGNORE\b/i,
        reason:
          'INSERT IGNORE / .ignore() silently swallows NOT NULL & truncation errors on OceanBase/MySQL; use this.upsertRow(...)'
      },
      {
        regex: /\bNULLS\s+(?:FIRST|LAST)\b/i,
        reason:
          'NULLS FIRST/LAST is unsupported on MySQL/OceanBase; use CASE WHEN col IS NULL THEN 1 ELSE 0 END or a sentinel column'
      }
    ];
    for (const rule of nonPortableRules) {
      if (rule.regex.test(sqlFile.clean)) {
        failures.push(`[SQL Portability] ${domainRel}/${sqlRel}: ${rule.reason}`);
      }
    }

    if (sqlRel === 'sql/table.ts') {
      const tableCheck = analyzeSqlTableDefinitions(sqlFile.raw);
      for (const issue of tableCheck.issues) {
        failures.push(`[SQL Portability] ${domainRel}/${sqlRel}: ${issue}`);
      }
    }
  }

  for (const mongoRel of ['mongo/schema.ts', 'mongo/repo.ts']) {
    const mongoFile = readClean(mongoRel);
    if (mongoFile === null) {
      continue;
    }
    for (const spec of extractImportSpecifiers(mongoFile.clean)) {
      if (/^(?:kysely|pg|mysql2)(?:\/|$)/.test(spec) || /^\.\.\/sql(?:\/|$)/.test(spec)) {
        failures.push(`[Boundary] ${domainRel}/${mongoRel} must not import SQL module "${spec}"`);
      }
    }
  }

  const mongoSchema = readClean('mongo/schema.ts');
  if (mongoSchema !== null) {
    if (/\.\s*index\s*\(/.test(mongoSchema.clean)) {
      failures.push(
        `[Indexes] ${domainRel}/mongo/schema.ts calls .index() directly; declare all indexes via defineMongoCollection({ indexes }) or defineIndex(schema, ...)`
      );
    }
    if (/\bexport\s+const\s+\w+\s*=\s*getMongo(?:Log)?Model\b/.test(mongoSchema.clean)) {
      failures.push(
        `[Boundary] ${domainRel}/mongo/schema.ts registers Mongoose Model eagerly at module top level; declare defineMongoCollection(...) and bind model in MongoRepositoryBase constructor instead`
      );
    }

    const schemaAnalysis = analyzeSchemaIndexes({
      sourceText: mongoSchema.raw,
      repoRoot,
      sourceRelPath: `${domainRel}/mongo/schema.ts`
    });
    let withoutIndexDecls = mongoSchema.raw;
    for (const idx of schemaAnalysis.indexes) {
      withoutIndexDecls = withoutIndexDecls.replace(idx.raw, '');
    }
    for (const colDef of schemaAnalysis.collectionDefinitions ?? []) {
      withoutIndexDecls = withoutIndexDecls.replace(colDef.raw, '');
    }
    const cleanFieldDefs = stripCommentsPreserveStrings(withoutIndexDecls);
    if (/\b(?:index|unique)\s*:\s*true\b/.test(cleanFieldDefs)) {
      failures.push(
        `[Indexes] ${domainRel}/mongo/schema.ts uses inline field { index: true } or { unique: true }; move all index declarations to defineMongoCollection({ indexes })`
      );
    }
  }
};

checkDomainStaticBoundaries();

// 3. defineIndex 按集合（Schema/Collection）隔离零丢失比对
const mongoSchemaPath = path.join(domainAbs, 'mongo/schema.ts');
const collectionMap = parseInjectivePairMap({
  pairs: collectionMapArgs,
  flagName: '--collection-map'
});
const schemaMap = parseInjectivePairMap({
  pairs: schemaMapArgs,
  flagName: '--schema-map'
});

const legacySources = [];
let legacyReadFailed = false;

if (legacySchemaArgs.length > 0 && gitLegacyArgs.length > 0) {
  failures.push('[Indexes] Specify at most one of --legacy-schema or --git-legacy');
  legacyReadFailed = true;
} else if (legacySchemaArgs.length > 0) {
  for (const legacyArg of legacySchemaArgs) {
    const abs = path.resolve(repoRoot, legacyArg);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      failures.push(`[Indexes] Failed to read --legacy-schema file: ${legacyArg}`);
      legacyReadFailed = true;
      continue;
    }
    legacySources.push({
      label: toPosixPath(legacyArg),
      relPath: toPosixPath(path.relative(repoRoot, abs)),
      content: fs.readFileSync(abs, 'utf8')
    });
  }
} else if (gitLegacyArgs.length > 0) {
  for (const gitArg of gitLegacyArgs) {
    const res = readGitLegacyFile(repoRoot, gitArg);
    if (!res.ok) {
      failures.push(
        `[Indexes] Failed to read --git-legacy "${gitArg}" (resolved git object "${res.objectSpec}": ${res.error}). Pass merge-base:${res.relPath} or <ref>:${res.relPath} when comparing against a committed deletion.`
      );
      legacyReadFailed = true;
      continue;
    }
    legacySources.push({
      label: res.objectSpec,
      relPath: res.relPath,
      gitRef: res.gitRef,
      content: res.content
    });
  }
}

const mongoSchemaRaw = fs.existsSync(mongoSchemaPath)
  ? fs.readFileSync(mongoSchemaPath, 'utf8')
  : null;

const verifyIndexParityByOwner = ({ legacyItems, newContent }) => {
  const legacyAnalyses = legacyItems.map((src) => ({
    ...src,
    ...analyzeSchemaIndexes({
      sourceText: src.content,
      repoRoot,
      sourceRelPath: src.relPath,
      gitRef: src.gitRef
    })
  }));
  const newAnalysis = analyzeSchemaIndexes({
    sourceText: newContent,
    repoRoot,
    sourceRelPath: `${domainRel}/mongo/schema.ts`
  });

  for (const src of legacyAnalyses) {
    for (const err of src.ownershipErrors) {
      failures.push(`[Indexes] Ambiguous ownership in legacy schema ${src.label}: ${err}`);
    }
  }
  for (const err of newAnalysis.ownershipErrors) {
    failures.push(`[Indexes] Ambiguous ownership in ${domainRel}/mongo/schema.ts: ${err}`);
  }

  const allLegacyIndexes = legacyAnalyses.flatMap((src) =>
    src.indexes.map((idx) => ({ ...idx, sourceLabel: src.label }))
  );
  if (allLegacyIndexes.length === 0) {
    return;
  }

  const legacyDistinctSchemas = new Set([
    ...legacyAnalyses.flatMap((s) => s.declaredSchemas),
    ...allLegacyIndexes.map((i) => i.schemaVar).filter(Boolean)
  ]);
  const newDistinctSchemas = new Set([
    ...newAnalysis.declaredSchemas,
    ...newAnalysis.indexes.map((i) => i.schemaVar).filter(Boolean)
  ]);
  const hasAnyModelRegistration =
    legacyAnalyses.some((s) => s.modelRegistrations.length > 0) ||
    newAnalysis.modelRegistrations.length > 0;

  // 仅当单旧文件、单 Schema 且新旧两侧均未注册 getMongoModel 时（极简语法片段单测），允许按 Schema 变量名精确匹配
  const canUseSingleSchemaVarFallback =
    legacyAnalyses.length === 1 &&
    !hasAnyModelRegistration &&
    collectionMap.size === 0 &&
    legacyDistinctSchemas.size <= 1 &&
    newDistinctSchemas.size <= 1;

  if (canUseSingleSchemaVarFallback) {
    const newSigsBySchema = new Map();
    for (const idx of newAnalysis.indexes) {
      if (idx.schemaVar === null) {
        continue;
      }
      if (!newSigsBySchema.has(idx.schemaVar)) {
        newSigsBySchema.set(idx.schemaVar, new Set());
      }
      newSigsBySchema.get(idx.schemaVar).add(idx.signature);
    }

    for (const oldIdx of allLegacyIndexes) {
      if (oldIdx.schemaVar === null) {
        continue;
      }
      const targetSchemaVar = schemaMap.get(oldIdx.schemaVar) ?? oldIdx.schemaVar;
      if (newDistinctSchemas.size > 0 && !newDistinctSchemas.has(targetSchemaVar)) {
        failures.push(
          `[Indexes] Cannot verify index ownership: legacy schema "${oldIdx.schemaVar}" has no collection binding and does not match new schema (${[...newDistinctSchemas].join(', ')}); bind getMongoModel or pass --schema-map ${oldIdx.schemaVar}=<NewSchema>`
        );
        continue;
      }
      const bucket = newSigsBySchema.get(targetSchemaVar);
      if (!bucket || !bucket.has(oldIdx.signature)) {
        const optsText =
          Object.keys(oldIdx.criticalOptions).length > 0
            ? `, options=${JSON.stringify(oldIdx.criticalOptions)}`
            : '';
        failures.push(
          `[Indexes] Missing or altered defineIndex for schema "${targetSchemaVar}": ${oldIdx.deprecated ? 'DEP' : 'ACT'} name=${oldIdx.name ?? '(unknown)'}, key=${oldIdx.keySummary}${optsText}`
        );
      }
    }
    return;
  }

  // 正式与多集合模式：严格按 MongoDB Collection 归属隔离比对，任何无法判定归属的索引立即拒绝验收
  let hasUnresolvedCollection = false;
  for (const oldIdx of allLegacyIndexes) {
    if (oldIdx.collection === null) {
      failures.push(
        `[Indexes] Cannot determine collection ownership for legacy defineIndex(${oldIdx.schemaVar ?? '(unknown)'}, key=${oldIdx.keySummary}) in ${oldIdx.sourceLabel}; bind schema to getMongoModel/getMongoLogModel`
      );
      hasUnresolvedCollection = true;
    }
  }
  for (const newIdx of newAnalysis.indexes) {
    if (newIdx.collection === null) {
      failures.push(
        `[Indexes] Cannot determine collection ownership for defineIndex(${newIdx.schemaVar ?? '(unknown)'}, key=${newIdx.keySummary}) in ${domainRel}/mongo/schema.ts; bind schema to getMongoModel/getMongoLogModel`
      );
      hasUnresolvedCollection = true;
    }
  }
  if (hasUnresolvedCollection) {
    return;
  }

  const legacyCollections = new Set(allLegacyIndexes.map((idx) => idx.collection));
  for (const mappedOld of collectionMap.keys()) {
    if (!legacyCollections.has(mappedOld)) {
      failures.push(
        `[Indexes] --collection-map source "${mappedOld}" not found among legacy indexed collections (${[...legacyCollections].join(', ')})`
      );
    }
  }

  const resolvedTargetToOld = new Map();
  for (const oldCol of legacyCollections) {
    const targetCol = collectionMap.get(oldCol) ?? oldCol;
    const prevOld = resolvedTargetToOld.get(targetCol);
    if (prevOld !== undefined && prevOld !== oldCol) {
      failures.push(
        `[Indexes] Collection mapping collision: legacy collections "${prevOld}" and "${oldCol}" both resolve to "${targetCol}"`
      );
    } else {
      resolvedTargetToOld.set(targetCol, oldCol);
    }
  }

  const newSigsByCollection = new Map();
  for (const newIdx of newAnalysis.indexes) {
    if (!newSigsByCollection.has(newIdx.collection)) {
      newSigsByCollection.set(newIdx.collection, new Set());
    }
    newSigsByCollection.get(newIdx.collection).add(newIdx.signature);
  }

  for (const oldIdx of allLegacyIndexes) {
    const oldCol = oldIdx.collection;
    const targetCol = collectionMap.get(oldCol) ?? oldCol;
    const targetSigs = newSigsByCollection.get(targetCol);

    if (!targetSigs || !targetSigs.has(oldIdx.signature)) {
      const optsText =
        Object.keys(oldIdx.criticalOptions).length > 0
          ? `, options=${JSON.stringify(oldIdx.criticalOptions)}`
          : '';
      const mapHint = targetCol !== oldCol ? ` (mapped from "${oldCol}")` : '';
      const fromText = legacyAnalyses.length > 1 ? ` in ${oldIdx.sourceLabel}` : '';
      failures.push(
        `[Indexes] Missing or altered defineIndex for collection "${targetCol}"${mapHint}${fromText}: ${oldIdx.deprecated ? 'DEP' : 'ACT'} name=${oldIdx.name ?? '(unknown)'}, key=${oldIdx.keySummary}${optsText}`
      );
    }
  }
};

if (!legacyReadFailed && legacySources.length > 0 && mongoSchemaRaw !== null) {
  verifyIndexParityByOwner({ legacyItems: legacySources, newContent: mongoSchemaRaw });
} else if (legacySchemaArgs.length === 0 && gitLegacyArgs.length === 0) {
  warnings.push('[Indexes] Neither --legacy-schema nor --git-legacy provided; skipped index diff check');
}

// 4. 收口与全仓残留裸调用清零检查（覆盖生产代码与非 migration 测试夹具，历史 migration 豁免）
if (!allowWipSlice1) {
  const siblingLegacySchemas = findSiblingLegacySchemas(repoRoot, domainAbs);
  if (siblingLegacySchemas.length > 0) {
    failures.push(
      `[Closure] Legacy schema/model file still exists in ${domainRel} (${siblingLegacySchemas.join(', ')}); pass --allow-wip-slice1 only during Slice 1`
    );
  }

  const newExportedSymbols = new Set(
    mongoSchemaRaw !== null ? extractExportedModelNames(mongoSchemaRaw) : []
  );
  const legacyModelNames = new Set([
    ...explicitLegacyModels,
    ...legacySources.flatMap((src) => extractExportedModelNames(src.content))
  ]);

  const searchDirs = ['packages', 'projects', 'pro/admin/src', 'pro/admin/test', 'test'].filter(
    (d) => fs.existsSync(path.join(repoRoot, d))
  );

  for (const modelName of legacyModelNames) {
    if (!modelName || newExportedSymbols.has(modelName)) {
      continue;
    }
    const out = runRg(
      ['-l', '--word-regexp', modelName, ...searchDirs, '--glob', '*.{ts,tsx}'],
      repoRoot
    );
    const hitFiles = out
      .split('\n')
      .map((f) => toPosixPath(f.trim()))
      .filter((f) => f.length > 0);
    const residualProdFiles = hitFiles.filter((f) => !isTestOrMigrationFile(f));
    const residualTestFiles = hitFiles.filter((f) => isTestFile(f) && !isMigrationFile(f));

    if (residualProdFiles.length > 0) {
      failures.push(
        `[Callers] Residual production reference(s) to legacy model "${modelName}" (${residualProdFiles.length}): ${residualProdFiles.join(', ')}`
      );
    }
    if (residualTestFiles.length > 0) {
      failures.push(
        `[Test Callers] Residual test fixture reference(s) to legacy model "${modelName}" (${residualTestFiles.length}): ${residualTestFiles.join(', ')} (migrate test fixtures to Repo/Service so suite can run on OceanBase/PG)`
      );
    }
  }
}

// 5. 契约测试存在性、真实注册调用、真实事务门禁与日志 Noop 断言覆盖检查
const checkContractTestGovernance = () => {
  const inferredTestDir = inferDomainTestDir(domainRel);
  const candidateFiles = new Set();

  if (inferredTestDir !== undefined) {
    const defaultContractRel = `${inferredTestDir}/repo.contract.test.ts`;
    const defaultAbs = path.resolve(repoRoot, defaultContractRel);
    if (fs.existsSync(defaultAbs) && fs.statSync(defaultAbs).isFile()) {
      candidateFiles.add(defaultContractRel);
    }
  }
  for (const target of testTargets) {
    const rel = toPosixPath(target).replace(/^\.\//, '');
    const abs = path.resolve(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      candidateFiles.add(rel);
    }
  }

  const execCodeByFile = new Map();
  for (const rel of candidateFiles) {
    const raw = fs.readFileSync(path.resolve(repoRoot, rel), 'utf8');
    execCodeByFile.set(rel, stripImportsAndStrings(raw));
  }

  const CONTRACT_SUITE_CALL_REGEX = /\bregister(?:Dual|Multi)DialectContractSuite\s*\(/;
  const TEST_CASE_CALL_REGEX = /\b(?:it|test)\s*(?:\.(?:each|concurrent|sequential))?\s*\(/;
  const ASSERTION_CALL_REGEX = /\bexpect\s*\(/;
  const STUBBED_TX_REGEX =
    /transactionRunner\s*:\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:\{\s*return\s+)?execute\s*\(\s*undefined\s*\)/;
  const REAL_NOOP_EXEC_REGEX =
    /\bnew\s+Noop[A-Za-z0-9_$]*Repository\s*\(|\btoBeInstanceOf\s*\(\s*Noop[A-Za-z0-9_$]*Repository\s*\)|\b(?:logDisabled\s*:\s*true|withLogDatabase\s*:\s*false|logWriteUrl\s*:\s*undefined)\b/;

  const contractTestFiles = [...candidateFiles].filter((rel) => {
    if (rel.includes('.contract.test.')) {
      return true;
    }
    return CONTRACT_SUITE_CALL_REGEX.test(execCodeByFile.get(rel) ?? '');
  });

  if (inferredTestDir !== undefined && !allowWipSlice1 && contractTestFiles.length === 0) {
    failures.push(
      `[Tests] Missing multi-dialect contract test file (expected ${inferredTestDir}/repo.contract.test.ts or pass via --test)`
    );
    return;
  }

  const isLogDomain = /\bdefineLogRepoToken\b/.test(repoTsText);
  let hasExecutableLogNoopTest = false;

  for (const rel of candidateFiles) {
    const execCode = execCodeByFile.get(rel) ?? '';
    if (
      TEST_CASE_CALL_REGEX.test(execCode) &&
      ASSERTION_CALL_REGEX.test(execCode) &&
      REAL_NOOP_EXEC_REGEX.test(execCode)
    ) {
      hasExecutableLogNoopTest = true;
    }
  }

  for (const rel of contractTestFiles) {
    const execCode = execCodeByFile.get(rel) ?? '';

    if (STUBBED_TX_REGEX.test(execCode)) {
      failures.push(
        `[Tests] ${rel} stubs transactionRunner with execute(undefined); contract tests must run against real Mongo replset transactions`
      );
    }
    if (!CONTRACT_SUITE_CALL_REGEX.test(execCode)) {
      failures.push(
        `[Tests] ${rel} must invoke registerDualDialectContractSuite(...) / registerMultiDialectContractSuite(...) (bare imports or strings do not count)`
      );
    }
    if (!TEST_CASE_CALL_REGEX.test(execCode) || !ASSERTION_CALL_REGEX.test(execCode)) {
      failures.push(
        `[Tests] ${rel} must declare executable test case(s) with expect(...) assertions`
      );
    }
  }

  if (isLogDomain && contractTestFiles.length > 0 && !hasExecutableLogNoopTest) {
    failures.push(
      `[Tests] Log domain ${domainRel} uses defineLogRepoToken, but tests do not exercise Noop / unconfigured-log behavior with real assertions (bare imports or string literals do not count)`
    );
  }
};

checkContractTestGovernance();

// 6. 运行契约与业务测试（静态门禁存在失败时 Fail-Fast，避免无效拉起 Vitest）
if (testTargets.length > 0 && failures.length === 0) {
  const dalTargets = testTargets
    .map((t) => toPosixPath(t).replace(/^\.\//, ''))
    .filter((t) => t.startsWith('packages/dal/'))
    .map((t) => t.slice('packages/dal/'.length));
  const rootTargets = testTargets
    .map((t) => toPosixPath(t).replace(/^\.\//, ''))
    .filter((t) => !t.startsWith('packages/dal/'));

  try {
    if (dalTargets.length > 0) {
      console.log(`Running @fastgpt/dal tests: ${dalTargets.join(' ')}`);
      execFileSync('pnpm', ['--filter', '@fastgpt/dal', 'test', ...dalTargets], {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    }
    if (rootTargets.length > 0) {
      console.log(`Running targeted tests: ${rootTargets.join(' ')}`);
      execFileSync('pnpm', ['test', ...rootTargets], {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    }
  } catch {
    failures.push(`[Tests] Targeted tests failed: ${testTargets.join(' ')}`);
  }
} else if (testTargets.length > 0) {
  warnings.push(
    `[Tests] Skipped executing --test (${testTargets.join(' ')}) until static verification issues above are fixed`
  );
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
