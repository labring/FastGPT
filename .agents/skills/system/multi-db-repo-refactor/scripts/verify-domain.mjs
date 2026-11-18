#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractDefineIndexes,
  extractExportedModelNames,
  findRepoRoot,
  findSiblingLegacySchemas,
  isTestOrMigrationFile,
  readGitLegacyFile,
  runRg,
  stripCommentsPreserveStrings,
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
const explicitLegacyModels = getFlagValues('--legacy-model');
const testTargets = getFlagValues('--test');

if (!fs.existsSync(domainAbs)) {
  console.error(`Domain directory does not exist: ${domainRel}`);
  process.exit(1);
}

const failures = [];
const warnings = [];
const checkFileExists = (rel) => fs.existsSync(path.join(domainAbs, rel));

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
        failures.push(`[Boundary] ${domainRel}/repo.type.ts must not import driver/dialect module "${spec}"`);
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
        reason: 'jsonb_path_exists / MERGE INTO is non-portable; use B-Tree columns or this.upsertRow(...)'
      }
    ];
    for (const rule of nonPortableRules) {
      if (rule.regex.test(sqlFile.clean)) {
        failures.push(`[SQL Portability] ${domainRel}/${sqlRel}: ${rule.reason}`);
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
        `[Indexes] ${domainRel}/mongo/schema.ts calls .index() directly; declare all indexes via defineIndex(schema, ...)`
      );
    }
    if (/\bexport\s+const\s+\w+\s*=\s*getMongo(?:Log)?Model\b/.test(mongoSchema.clean)) {
      failures.push(
        `[Boundary] ${domainRel}/mongo/schema.ts registers Mongoose Model eagerly at module top level; export a lazy getXxxMongoModel() factory instead`
      );
    }

    let withoutDefineIndexes = mongoSchema.raw;
    for (const idx of extractDefineIndexes(mongoSchema.raw)) {
      withoutDefineIndexes = withoutDefineIndexes.replace(idx.raw, '');
    }
    const cleanFieldDefs = stripCommentsPreserveStrings(withoutDefineIndexes);
    if (/\b(?:index|unique)\s*:\s*true\b/.test(cleanFieldDefs)) {
      failures.push(
        `[Indexes] ${domainRel}/mongo/schema.ts uses inline field { index: true } or { unique: true }; move all index declarations to defineIndex(...)`
      );
    }
  }
};

checkDomainStaticBoundaries();

// 3. defineIndex 零丢失比对（支持同目录多个旧 schema 合并至同一 mongo/schema.ts，及 merge-base:<path>）
const mongoSchemaPath = path.join(domainAbs, 'mongo/schema.ts');
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
      content: res.content
    });
  }
}

const mongoSchemaRaw = fs.existsSync(mongoSchemaPath)
  ? fs.readFileSync(mongoSchemaPath, 'utf8')
  : null;

if (!legacyReadFailed && legacySources.length > 0 && mongoSchemaRaw !== null) {
  const newIndexes = extractDefineIndexes(mongoSchemaRaw);
  const newSigs = new Set(newIndexes.map((idx) => idx.signature));

  for (const source of legacySources) {
    const oldIndexes = extractDefineIndexes(source.content);
    for (const oldIdx of oldIndexes) {
      if (!newSigs.has(oldIdx.signature)) {
        const optsText =
          Object.keys(oldIdx.criticalOptions).length > 0
            ? `, options=${JSON.stringify(oldIdx.criticalOptions)}`
            : '';
        const fromText = legacySources.length > 1 ? ` (from ${source.label})` : '';
        failures.push(
          `[Indexes] Missing or altered defineIndex${fromText}: ${oldIdx.deprecated ? 'DEP' : 'ACT'} name=${oldIdx.name ?? '(unknown)'}, key=${oldIdx.keySummary}${optsText}`
        );
      }
    }
  }
} else if (legacySchemaArgs.length === 0 && gitLegacyArgs.length === 0) {
  warnings.push('[Indexes] Neither --legacy-schema nor --git-legacy provided; skipped index diff check');
}

// 4. 收口与全仓残留裸调用清零检查（覆盖 schemaV2.ts / ttl.ts 及旧 Model 名残留引用）
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

  const searchDirs = ['packages', 'projects', 'pro/admin/src'].filter((d) =>
    fs.existsSync(path.join(repoRoot, d))
  );

  for (const modelName of legacyModelNames) {
    if (!modelName || newExportedSymbols.has(modelName)) {
      continue;
    }
    const out = runRg(
      ['-l', '--word-regexp', modelName, ...searchDirs, '--glob', '*.{ts,tsx}'],
      repoRoot
    );
    const residualFiles = out
      .split('\n')
      .map((f) => toPosixPath(f.trim()))
      .filter((f) => f.length > 0 && !isTestOrMigrationFile(f));

    if (residualFiles.length > 0) {
      failures.push(
        `[Callers] Residual production reference(s) to legacy model "${modelName}" (${residualFiles.length}): ${residualFiles.join(', ')}`
      );
    }
  }
}

// 5. 运行契约与业务测试
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
