import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeLogDualModeTestCoverage,
  analyzeMongoSchemaDatasource,
  analyzeMultiDialectContractCoverage,
  analyzeSchemaIndexes,
  analyzeSqlRepoDatasource,
  analyzeSqlTableDefinitions,
  buildDomainTestExecutionPlan,
  discoverMongoSchemas,
  extractDefineIndexes,
  findDomainServiceUnitTestFiles,
  readGitLegacyFile,
  verifyExecutedLogTopologyReports
} from './common.mjs';
import { buildRequiredLogTopologyCases } from '../../../../../packages/dal/db/logTopologyContract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../../..');
const auditScript = path.join(scriptDir, 'audit-domain.mjs');
const verifyScript = path.join(scriptDir, 'verify-domain.mjs');
const scaffoldScript = path.join(scriptDir, 'scaffold-repo.mjs');

const withTempDomain = ({ newMongoSchema, legacySchema, extraFiles = {} }, fn) => {
  const tmpBase = fs.mkdtempSync(path.join(repoRoot, '.verify-domain-test-'));
  const domainDir = path.join(tmpBase, 'domain');
  const legacyPath = path.join(tmpBase, 'legacySchema.ts');

  try {
    fs.mkdirSync(path.join(domainDir, 'mongo'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'sql'), { recursive: true });
    fs.writeFileSync(path.join(domainDir, 'repo.type.ts'), 'export type Repo = {};\n');
    fs.writeFileSync(path.join(domainDir, 'repo.ts'), 'export const Token = {};\n');
    fs.writeFileSync(path.join(domainDir, 'mongo/repo.ts'), 'export class MongoRepo {}\n');
    fs.writeFileSync(path.join(domainDir, 'sql/table.ts'), 'export const table = {};\n');
    fs.writeFileSync(path.join(domainDir, 'sql/repo.ts'), 'export class SqlRepo {}\n');
    fs.writeFileSync(path.join(domainDir, 'mongo/schema.ts'), newMongoSchema);
    fs.writeFileSync(legacyPath, legacySchema);

    for (const [rel, content] of Object.entries(extraFiles)) {
      const target = path.join(domainDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }

    fn({
      tmpBase,
      domainDir,
      domainRel: path.relative(repoRoot, domainDir),
      legacyRel: path.relative(repoRoot, legacyPath)
    });
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
};

const runNodeScript = (scriptPath, { args, cwd = repoRoot }) => {
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
};

const runVerify = (args, { cwd = repoRoot } = {}) => runNodeScript(verifyScript, { args, cwd });

test('extractDefineIndexes semantically parses keys, derived names, arithmetic TTL, expires duration strings, partial filters, and collations', () => {
  const indexes = extractDefineIndexes(`
    defineIndex(Schema, {
      key: { teamId: 1, /* comment */ name: 1 },
      options: {
        unique: true,
        expireAfterSeconds: 24 * 60 * 60,
        partialFilterExpression: { deleteTime: null, status: 'active' },
        collation: { locale: 'en', strength: 2 }
      }
    });
    defineIndex(LogSchema, {
      key: { time: 1 },
      options: { expires: '15d' }
    });
  `);

  assert.equal(indexes.length, 2);
  assert.equal(indexes[0].name, 'teamId_1_name_1');
  assert.equal(indexes[0].deprecated, false);
  assert.deepEqual(indexes[0].keyEntries, [
    ['teamId', 1],
    ['name', 1]
  ]);
  assert.deepEqual(indexes[0].criticalOptions, {
    unique: true,
    expireAfterSeconds: 86400,
    partialFilterExpression: { deleteTime: null, status: 'active' },
    collation: { locale: 'en', strength: 2 }
  });
  assert.deepEqual(indexes[1].criticalOptions, {
    expireAfterSeconds: 15 * 86400
  });
});

test('fails when unique option or expires string TTL is dropped or altered', () => {
  withTempDomain(
    {
      legacySchema: `defineIndex(AppRegistrationSchema, { key: { teamId: 1 }, options: { unique: true } });`,
      newMongoSchema: `defineIndex(AppRegistrationSchema, { key: { teamId: 1 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Missing or altered defineIndex/);
      assert.match(res.stderr, /"unique":true/);
    }
  );

  withTempDomain(
    {
      legacySchema: `defineIndex(LogSchema, { key: { createdAt: 1 }, options: { expires: '15d' } });`,
      newMongoSchema: `defineIndex(LogSchema, { key: { createdAt: 1 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /"expireAfterSeconds":1296000/);
    }
  );

  withTempDomain(
    {
      legacySchema: `defineIndex(LogSchema, { key: { createdAt: 1 }, options: { expires: '15d' } });`,
      newMongoSchema: `defineIndex(LogSchema, { key: { createdAt: 1 }, options: { expireAfterSeconds: 15 * 24 * 60 * 60 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 0, res.stderr);
    }
  );
});

test('fails when explicit index name, partialFilterExpression, collation, or compound key order changes', () => {
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 }, options: { name: 'idx_team_custom' } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /name=idx_team_custom/);
    }
  );

  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1, appId: 1 }, options: { partialFilterExpression: { appId: { $exists: true } }, collation: { locale: 'en', strength: 2 } } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1, appId: 1 }, options: { partialFilterExpression: { appId: { $exists: true } } } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /"collation"/);
    }
  );

  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { a: 1, b: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { b: 1, a: 1 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
    }
  );
});

test('isolates index comparison by collection across merged schemas (prevents identical key/name cross-collection masking)', () => {
  // 1. Multi-file merge where both collections A ("evals") and B ("eval_items") share { teamId: 1, unique: true }:
  //    dropping B's unique index must FAIL even when A keeps the identical index.
  withTempDomain(
    {
      legacySchema: `
        const EvalSchema = new Schema({});
        defineIndex(EvalSchema, { key: { teamId: 1 }, options: { unique: true } });
        const EvalModel = getMongoModel('evals', EvalSchema);
      `,
      newMongoSchema: `
        const EvalMongoSchema = new Schema({});
        const EvalItemMongoSchema = new Schema({});
        defineIndex(EvalMongoSchema, { key: { teamId: 1 }, options: { unique: true } });
        export const getEvalMongoModel = () => getMongoModel('evals', EvalMongoSchema);
        export const getEvalItemMongoModel = () => getMongoModel('eval_items', EvalItemMongoSchema);
      `
    },
    ({ tmpBase, domainDir, domainRel, legacyRel }) => {
      const secondLegacy = path.join(tmpBase, 'evalItemSchema.ts');
      fs.writeFileSync(
        secondLegacy,
        `
          const EvalItemSchema = new Schema({});
          defineIndex(EvalItemSchema, { key: { teamId: 1 }, options: { unique: true } });
          const EvalItemModel = getMongoModel('eval_items', EvalItemSchema);
        `
      );
      const secondRel = path.relative(repoRoot, secondLegacy);

      const missingBRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, secondRel]);
      assert.equal(missingBRes.status, 1);
      assert.match(missingBRes.stderr, /collection "eval_items"/);
      assert.match(missingBRes.stderr, /"unique":true/);

      // Non-injective --collection-map attempting to collapse eval_items onto evals must ALSO fail
      const collisionRes = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        secondRel,
        '--collection-map',
        'eval_items=evals'
      ]);
      assert.equal(collisionRes.status, 1);
      assert.match(collisionRes.stderr, /Collection mapping collision/);

      // Restoring B's unique index makes verification PASS
      fs.writeFileSync(
        path.join(domainDir, 'mongo/schema.ts'),
        `
          const EvalMongoSchema = new Schema({});
          const EvalItemMongoSchema = new Schema({});
          defineIndex(EvalMongoSchema, { key: { teamId: 1 }, options: { unique: true } });
          defineIndex(EvalItemMongoSchema, { key: { teamId: 1 }, options: { unique: true } });
          export const getEvalMongoModel = () => getMongoModel('evals', EvalMongoSchema);
          export const getEvalItemMongoModel = () => getMongoModel('eval_items', EvalItemMongoSchema);
        `
      );
      const restoredRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, secondRel]);
      assert.equal(restoredRes.status, 0, restoredRes.stderr);

      // Collection rename requires explicit --collection-map
      fs.writeFileSync(
        path.join(domainDir, 'mongo/schema.ts'),
        `
          const EvalMongoSchema = new Schema({});
          const EvalItemMongoSchema = new Schema({});
          defineIndex(EvalMongoSchema, { key: { teamId: 1 }, options: { unique: true } });
          defineIndex(EvalItemMongoSchema, { key: { teamId: 1 }, options: { unique: true } });
          export const getEvalMongoModel = () => getMongoModel('evals', EvalMongoSchema);
          export const getEvalItemMongoModel = () => getMongoModel('eval_items_v2', EvalItemMongoSchema);
        `
      );
      const unmappedRenameRes = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        secondRel
      ]);
      assert.equal(unmappedRenameRes.status, 1);
      assert.match(unmappedRenameRes.stderr, /collection "eval_items"/);

      const mappedRenameRes = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        secondRel,
        '--collection-map',
        'eval_items=eval_items_v2'
      ]);
      assert.equal(mappedRenameRes.status, 0, mappedRenameRes.stderr);
    }
  );

  // 2. Rejects verification when collection ownership cannot be determined (orphan schema or dynamic collection expr)
  withTempDomain(
    {
      legacySchema: `
        const SchemaA = new Schema({});
        defineIndex(SchemaA, { key: { teamId: 1 } });
      `,
      newMongoSchema: `
        const SchemaA = new Schema({});
        const SchemaB = new Schema({});
        defineIndex(SchemaA, { key: { teamId: 1 } });
        export const getAModel = () => getMongoModel('col_a', SchemaA);
        export const getBModel = () => getMongoModel(computeDynamicName(), SchemaB);
      `
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /Cannot resolve static collection name|Cannot determine collection ownership/
      );
    }
  );
});

test('enforces static layered isolation, SQL portability, and Mongo index governance rules', () => {
  // 1. SQL portability: ILIKE + RETURNING + Mongo import
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/repo.ts': `
          import { getFoo } from '../mongo/schema';
          export const bad = (q) => q.where('name', 'ilike', '%a%').returningAll();
        `
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /must not import Mongo module/);
      assert.match(res.stderr, /ILIKE is non-portable/);
      assert.match(res.stderr, /RETURNING is unsupported/);
    }
  );

  // 2. Domain boundary: repo.type.ts leaking FilterQuery / service.ts importing ./mongo/repo
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'repo.type.ts': `import type { FilterQuery } from 'mongoose';\nexport type R = FilterQuery<unknown>;`,
        'service.ts': `import { MongoRepo } from './mongo/repo';\nexport const s = new MongoRepo();`
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /repo\.type\.ts must not import driver/);
      assert.match(res.stderr, /leaks Mongoose driver type "FilterQuery"/);
      assert.match(res.stderr, /service\.ts must inject RepoToken/);
    }
  );

  // 3. Mongo index governance: .index(), inline field unique: true, eager getMongoModel
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `
        const S = new Schema({ key: { type: String, unique: true } });
        S.index({ key: 1 });
        defineIndex(S, { key: { teamId: 1 } });
        defineIndex(S, { key: { oldField: 1 }, deprecated: true });
        export const MongoBad = getMongoModel('bad', S);
      `
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /calls \.index\(\) directly/);
      assert.match(res.stderr, /must not declare deprecated: true tombstones/);
      assert.match(res.stderr, /inline field \{ index: true \} or \{ unique: true \}/);
      assert.match(res.stderr, /registers Mongoose Model eagerly/);
    }
  );
});

test('detects non-standard legacy schema files (ttl.ts / schemaV2.ts) and residual production callers', () => {
  // Verify discoverMongoSchemas finds both schemaV2.ts and ttl.ts in the real repo
  const discoveredPaths = new Set(discoverMongoSchemas(repoRoot).map((s) => s.relPath));
  assert.ok(discoveredPaths.has('packages/service/core/dataset/tag/schemaV2.ts'));
  assert.ok(discoveredPaths.has('packages/service/common/s3/models/ttl.ts'));

  const tempCallerAbs = path.join(repoRoot, 'packages/service/.residual-caller-probe.ts');
  try {
    fs.writeFileSync(
      tempCallerAbs,
      `export const leak = () => MongoTempResidualProbe991.findOne({});\n`
    );

    withTempDomain(
      {
        legacySchema: `
          defineIndex(S, { key: { teamId: 1 } });
          export const MongoTempResidualProbe991 = getMongoModel('probe', S);
        `,
        newMongoSchema: `
          defineIndex(S, { key: { teamId: 1 } });
          export const getProbeMongoModel = () => getMongoModel('probe', S);
        `,
        extraFiles: {
          'ttl.ts': `export const MongoSiblingTtl = getMongoModel('ttl', S);\n`
        }
      },
      ({ domainRel, legacyRel }) => {
        const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
        assert.equal(res.status, 1);
        assert.match(res.stderr, /\[Closure\].*ttl\.ts/);
        assert.match(
          res.stderr,
          /\[Callers\] Residual production reference\(s\) to legacy model "MongoTempResidualProbe991"/
        );

        const slice1Res = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1'
        ]);
        assert.equal(slice1Res.status, 0, slice1Res.stderr);
      }
    );
  } finally {
    fs.rmSync(tempCallerAbs, { force: true });
  }
});

test('scaffold-repo.mjs preserves existing service.ts without emitting mismatched service.test.ts, emits paired service.test.ts for new domains, and passes verify-domain.mjs', () => {
  const tmpDomainRel = 'packages/service/.scaffold-verify-probe';
  const tmpDomainAbs = path.join(repoRoot, tmpDomainRel);
  const tmpTestAbs = path.join(repoRoot, 'packages/service/test/.scaffold-verify-probe');
  const tmpFreshDomainRel = 'packages/service/.scaffold-fresh-probe';
  const tmpFreshDomainAbs = path.join(repoRoot, tmpFreshDomainRel);
  const tmpFreshTestAbs = path.join(repoRoot, 'packages/service/test/.scaffold-fresh-probe');

  try {
    // 1. Existing service.ts preserved -> must NOT emit template service.test.ts importing nonexistent ProbeWidgetService
    fs.mkdirSync(tmpDomainAbs, { recursive: true });
    const existingServiceText = 'export const keepMyExistingBusinessLogic = true;\n';
    fs.writeFileSync(path.join(tmpDomainAbs, 'service.ts'), existingServiceText);

    const scaffoldRes = runNodeScript(scaffoldScript, {
      args: [
        '--dir',
        tmpDomainRel,
        '--entity',
        'ProbeWidget',
        '--table',
        'probe_widgets',
        '--datasource',
        'log',
        '--soft-delete'
      ]
    });
    assert.equal(scaffoldRes.status, 0, scaffoldRes.stderr);
    assert.match(scaffoldRes.stdout, /Skipped existing: packages\/service\/\.scaffold-verify-probe\/service\.ts/);
    assert.match(scaffoldRes.stdout, /Skipped packages\/service\/test\/\.scaffold-verify-probe\/service\.test\.ts/);
    assert.equal(fs.readFileSync(path.join(tmpDomainAbs, 'service.ts'), 'utf8'), existingServiceText);
    assert.equal(fs.existsSync(path.join(tmpTestAbs, 'service.test.ts')), false);

    const sqlRepo = fs.readFileSync(path.join(tmpDomainAbs, 'sql/repo.ts'), 'utf8');
    assert.match(sqlRepo, /this\.readDb\(tx\)/);
    assert.match(sqlRepo, /this\.normalizeId\(id\)/);
    assert.match(sqlRepo, /isValidEntityId\(id\)/);

    assert.equal(fs.existsSync(path.join(tmpDomainAbs, 'noop/repo.ts')), false);
    const repoTs = fs.readFileSync(path.join(tmpDomainAbs, 'repo.ts'), 'utf8');
    assert.match(repoTs, /\bdefineRepoToken</);

    const contractTest = fs.readFileSync(
      path.join(tmpTestAbs, 'repo.contract.test.ts'),
      'utf8'
    );
    assert.doesNotMatch(contractTest, /execute\(undefined\)/);
    assert.match(contractTest, /createContractBackends\(/);
    assert.match(contractTest, /compileSqlTableDDL\(probeWidgetSqlTable, 'oceanbase'\)/);
    assert.match(contractTest, /registerLogTopologyContractSuite\(/);
    assert.match(contractTest, /logMode:\s*'separate'/);

    const verifyRes = runVerify(['--dir', tmpDomainRel]);
    assert.equal(verifyRes.status, 0, verifyRes.stderr);

    // 2. Fresh domain without existing service.ts -> emits BOTH service.ts and matching L0 service.test.ts
    const freshRes = runNodeScript(scaffoldScript, {
      args: [
        '--dir',
        tmpFreshDomainRel,
        '--entity',
        'FreshWidget',
        '--table',
        'fresh_widgets'
      ]
    });
    assert.equal(freshRes.status, 0, freshRes.stderr);
    assert.equal(fs.existsSync(path.join(tmpFreshDomainAbs, 'service.ts')), true);
    const serviceTest = fs.readFileSync(path.join(tmpFreshTestAbs, 'service.test.ts'), 'utf8');
    assert.match(serviceTest, /new FreshWidgetService\(/);
    assert.doesNotMatch(serviceTest, /vi\.mock\(/);

    const verifyFreshRes = runVerify(['--dir', tmpFreshDomainRel]);
    assert.equal(verifyFreshRes.status, 0, verifyFreshRes.stderr);
  } finally {
    fs.rmSync(tmpDomainAbs, { recursive: true, force: true });
    fs.rmSync(tmpTestAbs, { recursive: true, force: true });
    fs.rmSync(tmpFreshDomainAbs, { recursive: true, force: true });
    fs.rmSync(tmpFreshTestAbs, { recursive: true, force: true });
  }
});

test('enforces OceanBase/MySQL portability rules for inline, local-const, and unverifiable dynamic defineSqlTable declarations', () => {
  const tableCheck = analyzeSqlTableDefinitions(`
    export const badTable = defineSqlTable({
      name: 'bad_items',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        body: { kind: 'text', defaultValue: '' },
        meta: { kind: 'json', defaultValue: '{}' },
        a: { kind: 'varchar', length: 500 },
        b: { kind: 'varchar', length: 400 }
      },
      indexes: [
        { name: 'idx_body', columns: ['body'] },
        { name: 'idx_too_wide', columns: ['a', 'b'] }
      ]
    });
  `);
  assert.equal(tableCheck.issues.length, 6);
  assert.ok(tableCheck.issues.some((i) => i.includes('column "body" (text) must not declare defaultValue')));
  assert.ok(tableCheck.issues.some((i) => i.includes('column "meta" (json) must not declare defaultValue')));
  assert.ok(tableCheck.issues.some((i) => i.includes('cannot index text column "body"')));
  assert.ok(tableCheck.issues.some((i) => i.includes('exceeds OceanBase/MySQL utf8mb4 limit (3072B)')));
  assert.ok(tableCheck.issues.some((i) => i.includes('must start with "fg_"')));

  const validDescTable = analyzeSqlTableDefinitions(`
    export const okTable = defineSqlTable({
      name: 'ok_items',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        team_id: { kind: 'entityId' },
        create_time: { kind: 'timestamp' }
      },
      indexes: [
        { name: 'fg_ok_team_created', columns: ['team_id', { column: 'create_time', direction: 'desc' }] }
      ]
    });
  `);
  assert.deepEqual(validDescTable.issues, []);

  // 1. Inline bad table + non-portable SQL repo rules
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/table.ts': `
          export const badTable = defineSqlTable({
            name: 'bad_items',
            columns: {
              _id: { kind: 'entityId', primaryKey: true },
              note: { kind: 'text', defaultValue: '' },
              long_a: { kind: 'varchar', length: 600 },
              long_b: { kind: 'varchar', length: 300 }
            },
            indexes: [{ name: 'idx_wide', columns: ['long_a', 'long_b'] }]
          });
        `,
        'sql/repo.ts': `
          export const badQuery = (q) => q.insertInto('t').ignore().orderBy(sql\`pinned_at DESC NULLS LAST\`);
        `
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /INSERT IGNORE \/ \.ignore\(\)/);
      assert.match(res.stderr, /NULLS FIRST\/LAST is unsupported/);
      assert.match(res.stderr, /must not declare defaultValue/);
      assert.match(res.stderr, /exceeds OceanBase\/MySQL utf8mb4 limit/);
    }
  );

  // 2. Local const + as const passed to defineSqlTable(definition) must still fail on text defaultValue
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/table.ts': `
          const definition = {
            name: 'local_const_items',
            columns: {
              _id: { kind: 'entityId', primaryKey: true },
              note: { kind: 'text', defaultValue: '' }
            }
          } as const;
          export const badLocalTable = defineSqlTable(definition);
        `
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /table "local_const_items" column "note" \(text\) must not declare defaultValue/);
    }
  );

  // 3. Valid local const (even with imported table name identifier) must PASS
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/table.ts': `
          const baseCols = { _id: { kind: 'entityId', primaryKey: true } } as const;
          const definition = {
            name: ImportedTableName,
            columns: {
              ...baseCols,
              title: { kind: 'varchar', length: 128 }
            },
            indexes: [{ name: 'fg_demo_title', columns: ['title'] }]
          } as const;
          export const okLocalTable = defineSqlTable(definition);
        `
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 0, res.stderr);
    }
  );

  // 4. Unverifiable dynamic defineSqlTable(buildTable()) must fail closed
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/table.ts': `
          export const dynTable = defineSqlTable(buildDynamicTable());
        `
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /cannot statically verify defineSqlTable/);
    }
  );
});

test('enforces contract test governance (forbids stubbed transactions, bare imports/strings pretending coverage, and legacy model refs in test fixtures)', () => {
  const tempTestLeakAbs = path.join(repoRoot, 'packages/service/test/.legacy-fixture-probe.test.ts');
  const tempStubContractAbs = path.join(repoRoot, 'packages/service/test/.bad-contract.contract.test.ts');
  const tempImportOnlyAbs = path.join(repoRoot, 'packages/service/test/.import-only.contract.test.ts');
  const tempStringOnlyNoopAbs = path.join(repoRoot, 'packages/service/test/.string-noop.contract.test.ts');
  try {
    fs.writeFileSync(
      tempTestLeakAbs,
      `export const fixture = () => MongoTempTestLeak771.create({});\n`
    );
    fs.writeFileSync(
      tempStubContractAbs,
      `
        registerDualDialectContractSuite({
          setup: () => configureMongoDalRuntime({ transactionRunner: async ({ execute }) => execute(undefined) }),
          registerTests: () => { it('t', () => { expect(1).toBe(1); }); }
        });
      `
    );
    // Bare import + string literal only — no suite call, no it/expect, no real Noop usage
    fs.writeFileSync(
      tempImportOnlyAbs,
      `
        import { registerDualDialectContractSuite } from '@fastgpt/dal/db/testing';
        export const marker = 'logMode: shared';
      `
    );
    // Real suite + assertion, but logMode only appears in a string literal
    fs.writeFileSync(
      tempStringOnlyNoopAbs,
      `
        import { registerDualDialectContractSuite } from '@fastgpt/dal/db/testing';
        registerDualDialectContractSuite({
          backends: [],
          registerTests: () => {
            it('only mentions logMode in a string', () => {
              const label = 'logMode: shared';
              expect(label).toBe('logMode: shared');
            });
          }
        });
      `
    );

    withTempDomain(
      {
        legacySchema: `
          defineIndex(S, { key: { teamId: 1 } });
          export const MongoTempTestLeak771 = getMongoLogModel('temp_log', S);
        `,
        newMongoSchema: `
          export const tempLogCollection = defineMongoCollection({
            name: 'temp_log',
            datasource: 'log',
            schema: S,
            indexes: [{ key: { teamId: 1 } }]
          });
        `,
        extraFiles: {
          'repo.ts': `export const Token = defineRepoToken('TempLog', { mongo, sql });\n`,
          'sql/repo.ts': `export class SqlTempLogRepo { protected override readonly datasource = 'log'; }\n`
        }
      },
      ({ domainRel, legacyRel }) => {
        const res = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--test',
          'packages/service/test/.bad-contract.contract.test.ts'
        ]);
        assert.equal(res.status, 1);
        assert.match(
          res.stderr,
          /\[Test Callers\] Residual test fixture reference\(s\) to legacy model "MongoTempTestLeak771"/
        );
        assert.match(res.stderr, /stubs transactionRunner with execute\(undefined\)/);
        assert.match(res.stderr, /must register executable registerLogTopologyContractSuite\(/);

        // Bare import + string literal pretending to be a contract test must FAIL
        const importOnlyRes = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1',
          '--test',
          'packages/service/test/.import-only.contract.test.ts'
        ]);
        assert.equal(importOnlyRes.status, 1);
        assert.match(importOnlyRes.stderr, /must invoke registerDualDialectContractSuite/);
        assert.match(importOnlyRes.stderr, /must declare executable test case\(s\) with expect\(\.\.\.\)/);
        assert.match(importOnlyRes.stderr, /must register executable registerLogTopologyContractSuite\(/);

        // Real suite but logMode only in string must FAIL
        const stringOnlyNoopRes = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1',
          '--test',
          'packages/service/test/.string-noop.contract.test.ts'
        ]);
        assert.equal(stringOnlyNoopRes.status, 1);
        assert.match(
          stringOnlyNoopRes.stderr,
          /must register executable registerLogTopologyContractSuite\(/
        );
      }
    );
  } finally {
    fs.rmSync(tempTestLeakAbs, { force: true });
    fs.rmSync(tempStubContractAbs, { force: true });
    fs.rmSync(tempImportOnlyAbs, { force: true });
    fs.rmSync(tempStringOnlyNoopAbs, { force: true });
  }
});

test('audit-domain.mjs separates out-of-SQL-scope GridFS legacy and reports recommended extra tests', () => {
  const statusRes = runNodeScript(auditScript, { args: ['--status', '--json'] });
  assert.equal(statusRes.status, 0, statusRes.stderr);
  const status = JSON.parse(statusRes.stdout);
  assert.ok(status.outOfSqlScopeSchemas.includes('packages/service/core/dataset/image/schema.ts'));

  const gridfsRes = runNodeScript(auditScript, {
    args: ['--model', 'MongoDatasetImageSchema', '--json']
  });
  assert.equal(gridfsRes.status, 0, gridfsRes.stderr);
  const gridfsReport = JSON.parse(gridfsRes.stdout);
  assert.equal(gridfsReport.mongoLegacyOnly, true);
  assert.equal(gridfsReport.sliceStrategy, 'out-of-sql-scope-mongo-legacy');

  const logRes = runNodeScript(auditScript, {
    args: ['--model', 'MongoLLMRequestRecord', '--json']
  });
  assert.equal(logRes.status, 0, logRes.stderr);
  const logReport = JSON.parse(logRes.stdout);
  assert.equal(logReport.datasource, 'log');
  assert.ok(logReport.recommendedExtraTests.some((t) => t.includes('日志库双态路由测试')));
  assert.ok(logReport.recommendedExtraTests.some((t) => t.includes('TTL 过期读过滤测试')));
});

test('fails loudly when --git-legacy cannot be read and passes with merge-base:<path> against real appRegistration in @fastgpt/dal', () => {
  const missingRes = runVerify([
    '--dir',
    'packages/dal/db/repos/appRegistration',
    '--git-legacy',
    'packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(missingRes.status, 1);
  assert.match(missingRes.stderr, /Failed to read --git-legacy/);

  const mergeBaseRes = runVerify([
    '--dir',
    'packages/dal/db/repos/appRegistration',
    '--git-legacy',
    'merge-base:packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(mergeBaseRes.status, 0, mergeBaseRes.stderr);
  assert.match(mergeBaseRes.stdout, /Domain verification PASSED/);
});

test('verifies defineMongoCollection index parity without false-positiving options.unique while still catching inline field unique', () => {
  const legacySchema = `
    export const DemoCollectionName = 'demo_items';
    const DemoSchema = new Schema({ teamId: String, code: String });
    defineIndex(DemoSchema, { key: { teamId: 1, code: 1 }, options: { unique: true, name: 'fg_demo_team_code' } });
    export const MongoDemo = getMongoModel(DemoCollectionName, DemoSchema);
  `;
  const newSchemaOk = `
    import { Schema } from 'mongoose';
    import { defineMongoCollection } from '../../../mongo/collection';
    export const DemoCollectionName = 'demo_items';
    const DemoSchema = new Schema({ teamId: String, code: String }, { versionKey: false });
    export const demoCollection = defineMongoCollection({
      name: DemoCollectionName,
      schema: DemoSchema,
      indexes: [{ key: { teamId: 1, code: 1 }, options: { unique: true, name: 'fg_demo_team_code' } }]
    });
  `;
  const newSchemaBadInline = `
    import { Schema } from 'mongoose';
    import { defineMongoCollection } from '../../../mongo/collection';
    export const DemoCollectionName = 'demo_items';
    const DemoSchema = new Schema({ teamId: String, code: { type: String, unique: true } }, { versionKey: false });
    export const demoCollection = defineMongoCollection({
      name: DemoCollectionName,
      schema: DemoSchema,
      indexes: [{ key: { teamId: 1, code: 1 }, options: { unique: true, name: 'fg_demo_team_code' } }]
    });
  `;

  withTempDomain({ newMongoSchema: newSchemaOk, legacySchema }, ({ domainDir, domainRel, legacyRel }) => {
    const okRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
    assert.equal(okRes.status, 0, `${okRes.stdout}\n${okRes.stderr}`);

    fs.writeFileSync(path.join(domainDir, 'mongo/schema.ts'), newSchemaOk.replace('unique: true, ', ''));
    const dropUniqueRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
    assert.equal(dropUniqueRes.status, 1);
    assert.match(dropUniqueRes.stderr, /Missing or altered defineIndex for collection "demo_items"/);

    fs.writeFileSync(path.join(domainDir, 'mongo/schema.ts'), newSchemaBadInline);
    const badInlineRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
    assert.equal(badInlineRes.status, 1);
    assert.match(badInlineRes.stderr, /uses inline field/);
  });
});

test('binds getter .schema aliases strictly to their enclosing getter scope (prevents adjacent getter misattribution)', () => {
  const newAdjacentGetterSchema = `
    const SchemaA = new Schema({ name: String, teamId: String });
    const SchemaB = new Schema({ teamId: String });
    defineIndex(SchemaA, { key: { name: 1 } });

    export const getAMongoModel = () => getMongoModel('probe_a', SchemaA);
    export const getBMongoModel = () => getMongoModel('probe_b', SchemaB);

    export const configureExtraIndexes = () => {
      const AliasA = getAMongoModel().schema;
      defineIndex(AliasA, { key: { teamId: 1 }, options: { unique: true } });
    };
  `;

  // Direct analysis check: AliasA must belong to probe_a, never overwritten by adjacent getBMongoModel -> probe_b
  const analysis = analyzeSchemaIndexes({
    sourceText: newAdjacentGetterSchema,
    repoRoot,
    sourceRelPath: 'probe/mongo/schema.ts'
  });
  assert.deepEqual(analysis.ownershipErrors, []);
  const aliasIndex = analysis.indexes.find((idx) => idx.schemaVar === 'AliasA');
  assert.ok(aliasIndex);
  assert.equal(aliasIndex.collection, 'probe_a');

  // End-to-end CLI check: legacy A has name index, legacy B has unique teamId index;
  // new schema gives both to A via AliasA and drops B's unique index -> MUST FAIL!
  withTempDomain(
    {
      legacySchema: `
        const LegacyA = new Schema({ name: String });
        defineIndex(LegacyA, { key: { name: 1 } });
        export const MongoProbeA = getMongoModel('probe_a', LegacyA);
      `,
      newMongoSchema: newAdjacentGetterSchema
    },
    ({ tmpBase, domainRel, legacyRel }) => {
      const legacyB = path.join(tmpBase, 'legacyB.ts');
      fs.writeFileSync(
        legacyB,
        `
          const LegacyB = new Schema({ teamId: String });
          defineIndex(LegacyB, { key: { teamId: 1 }, options: { unique: true } });
          export const MongoProbeB = getMongoModel('probe_b', LegacyB);
        `
      );
      const legacyBRel = path.relative(repoRoot, legacyB);

      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, legacyBRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /collection "probe_b"/);
      assert.match(res.stderr, /"unique":true/);
    }
  );

  // Ambiguous single getter registering two different collections must fail closed when aliased
  const ambiguousGetterSchema = `
    const SchemaA = new Schema({});
    const SchemaB = new Schema({});
    export const getDynamicModel = (flag: boolean) =>
      flag ? getMongoModel('probe_a', SchemaA) : getMongoModel('probe_b', SchemaB);
    export const configure = () => {
      const Alias = getDynamicModel(true).schema;
      defineIndex(Alias, { key: { teamId: 1 } });
    };
  `;
  const ambiguousAnalysis = analyzeSchemaIndexes({
    sourceText: ambiguousGetterSchema,
    repoRoot,
    sourceRelPath: 'probe/mongo/schema.ts'
  });
  assert.ok(
    ambiguousAnalysis.ownershipErrors.some((e) =>
      e.includes('references ambiguous model symbol "getDynamicModel"')
    )
  );
});

test('resolves imported collection name constants from the same historical git ref (never leaks working-tree renames)', () => {
  const tmpGitRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-verify-git-ref-'));
  const git = (args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', ...args], {
      cwd: tmpGitRepo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

  try {
    fs.writeFileSync(path.join(tmpGitRepo, 'pnpm-workspace.yaml'), 'packages: []\n');
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test User']);

    // Commit 1: legacy schema imports ColName = 'old_collection' from ./names
    const domainDir = path.join(tmpGitRepo, 'domain');
    fs.mkdirSync(domainDir, { recursive: true });
    fs.writeFileSync(
      path.join(domainDir, 'names.ts'),
      `export const ColName = 'old_collection';\n`
    );
    fs.writeFileSync(
      path.join(domainDir, 'legacySchema.ts'),
      `
        import { ColName } from './names';
        const LegacySchema = new Schema({ teamId: String });
        defineIndex(LegacySchema, { key: { teamId: 1 }, options: { unique: true } });
        export const MongoOldThing = getMongoModel(ColName, LegacySchema);
      `
    );
    git(['add', '.']);
    git(['commit', '--no-verify', '-m', 'commit 1: old collection name']);

    // Working tree / Commit 2: names.ts renamed to 'new_collection', migrated into domain/mongo/schema.ts
    fs.writeFileSync(
      path.join(domainDir, 'names.ts'),
      `export const ColName = 'new_collection';\n`
    );
    fs.rmSync(path.join(domainDir, 'legacySchema.ts'));
    fs.mkdirSync(path.join(domainDir, 'mongo'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'sql'), { recursive: true });
    fs.writeFileSync(path.join(domainDir, 'repo.type.ts'), 'export type Repo = {};\n');
    fs.writeFileSync(path.join(domainDir, 'repo.ts'), 'export const Token = {};\n');
    fs.writeFileSync(path.join(domainDir, 'mongo/repo.ts'), 'export class MongoRepo {}\n');
    fs.writeFileSync(path.join(domainDir, 'sql/table.ts'), 'export const table = {};\n');
    fs.writeFileSync(path.join(domainDir, 'sql/repo.ts'), 'export class SqlRepo {}\n');
    fs.writeFileSync(
      path.join(domainDir, 'mongo/schema.ts'),
      `
        import { ColName } from '../names';
        const NewSchema = new Schema({ teamId: String });
        defineIndex(NewSchema, { key: { teamId: 1 }, options: { unique: true } });
        export const getNewThingMongoModel = () => getMongoModel(ColName, NewSchema);
      `
    );
    git(['add', '.']);
    git(['commit', '--no-verify', '-m', 'commit 2: rename imported constant to new_collection']);

    // 1. Direct API verification: legacy resolved at HEAD~1 -> 'old_collection', current -> 'new_collection'
    const legacyFile = readGitLegacyFile(tmpGitRepo, 'HEAD~1:domain/legacySchema.ts');
    assert.equal(legacyFile.ok, true);
    assert.ok(legacyFile.gitRef);

    const legacyAnalysis = analyzeSchemaIndexes({
      sourceText: legacyFile.content,
      repoRoot: tmpGitRepo,
      sourceRelPath: legacyFile.relPath,
      gitRef: legacyFile.gitRef
    });
    assert.deepEqual(legacyAnalysis.ownershipErrors, []);
    assert.equal(legacyAnalysis.indexes[0].collection, 'old_collection');

    const newAnalysis = analyzeSchemaIndexes({
      sourceText: fs.readFileSync(path.join(domainDir, 'mongo/schema.ts'), 'utf8'),
      repoRoot: tmpGitRepo,
      sourceRelPath: 'domain/mongo/schema.ts'
    });
    assert.deepEqual(newAnalysis.ownershipErrors, []);
    assert.equal(newAnalysis.indexes[0].collection, 'new_collection');

    // 2. End-to-end CLI: without --collection-map must FAIL because old_collection != new_collection
    const unmappedRes = runVerify(
      ['--dir', 'domain', '--git-legacy', 'HEAD~1:domain/legacySchema.ts'],
      { cwd: tmpGitRepo }
    );
    assert.equal(unmappedRes.status, 1);
    assert.match(unmappedRes.stderr, /collection "old_collection"/);

    // 3. End-to-end CLI: with explicit --collection-map old_collection=new_collection must PASS
    const mappedRes = runVerify(
      [
        '--dir',
        'domain',
        '--git-legacy',
        'HEAD~1:domain/legacySchema.ts',
        '--collection-map',
        'old_collection=new_collection'
      ],
      { cwd: tmpGitRepo }
    );
    assert.equal(mappedRes.status, 0, mappedRes.stderr);

    // 4. Historical dependency missing at gitRef must fail closed (NEVER fall back to working tree)
    fs.writeFileSync(
      path.join(domainDir, 'onlyInWorktree.ts'),
      `export const WorktreeCol = 'worktree_only';\n`
    );
    const missingHistDepAnalysis = analyzeSchemaIndexes({
      sourceText: `
        import { WorktreeCol } from './onlyInWorktree';
        const S = new Schema({});
        defineIndex(S, { key: { a: 1 } });
        export const M = getMongoModel(WorktreeCol, S);
      `,
      repoRoot: tmpGitRepo,
      sourceRelPath: 'domain/legacySchema.ts',
      gitRef: legacyFile.gitRef
    });
    assert.ok(
      missingHistDepAnalysis.ownershipErrors.some((e) =>
        e.includes('not found at git ref')
      )
    );
    assert.equal(missingHistDepAnalysis.indexes[0].collection, null);
  } finally {
    fs.rmSync(tmpGitRepo, { recursive: true, force: true });
  }
});

test('Finding #17: statically resolves same-file log datasource constants/shorthand in mongo/schema.ts and sql/repo.ts, failing closed on dynamic expressions', () => {
  const shorthandLogSchema = `
    import { Schema } from 'mongoose';
    import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
    const datasource = 'log';
    const AuditSchema = new Schema({ teamId: String }, { versionKey: false });
    export const auditCollection = defineMongoCollection({
      name: 'audit_logs',
      schema: AuditSchema,
      datasource,
      indexes: [{ key: { teamId: 1 } }]
    });
  `;
  const constRefLogSchema = `
    import { Schema } from 'mongoose';
    import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
    const LOG_DS = 'log' as const;
    const AuditSchema = new Schema({ teamId: String }, { versionKey: false });
    export const auditCollection = defineMongoCollection({
      name: 'audit_logs',
      schema: AuditSchema,
      datasource: LOG_DS,
      indexes: [{ key: { teamId: 1 } }]
    });
  `;
  const dynamicDsSchema = `
    import { Schema } from 'mongoose';
    import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
    const AuditSchema = new Schema({ teamId: String }, { versionKey: false });
    export const auditCollection = defineMongoCollection({
      name: 'audit_logs',
      schema: AuditSchema,
      datasource: getDs(),
      indexes: [{ key: { teamId: 1 } }]
    });
  `;
  const legacyLogSchema = `
    const AuditSchema = new Schema({ teamId: String });
    defineIndex(AuditSchema, { key: { teamId: 1 } });
    export const MongoAuditLog = getMongoLogModel('audit_logs', AuditSchema);
  `;

  // Direct API checks
  const shorthandParsed = analyzeMongoSchemaDatasource({ sourceText: shorthandLogSchema });
  assert.deepEqual(shorthandParsed.errors, []);
  assert.equal(shorthandParsed.datasource, 'log');
  assert.equal(shorthandParsed.isLogDomain, true);

  const constRefParsed = analyzeMongoSchemaDatasource({ sourceText: constRefLogSchema });
  assert.deepEqual(constRefParsed.errors, []);
  assert.equal(constRefParsed.datasource, 'log');

  const dynamicParsed = analyzeMongoSchemaDatasource({ sourceText: dynamicDsSchema });
  assert.ok(
    dynamicParsed.errors.some((e) => e.includes('cannot statically resolve') && e.includes('getDs()'))
  );

  // Shadowed param in defineMongoCollection datasource must fail closed
  const shadowedDsParsed = analyzeMongoSchemaDatasource({
    sourceText: `
      const datasource = 'main';
      export function buildCol(datasource: any) {
        return defineMongoCollection({ name: 'x', schema: S, datasource, indexes: [] });
      }
    `
  });
  assert.ok(
    shadowedDsParsed.errors.some((e) => e.includes('shadowed by function parameter'))
  );

  // sql/repo.ts const resolution & spoof rejection
  const sqlConstRes = analyzeSqlRepoDatasource({
    sourceText: `
      const DS = 'log' as const;
      export class SqlAuditRepo {
        private readonly cfg: { datasource: string } = { datasource: 'main' };
        protected override readonly datasource = DS;
      }
    `
  });
  assert.deepEqual(sqlConstRes.errors, []);
  assert.equal(sqlConstRes.hasLogDatasource, true);

  const sqlOutsideVarRes = analyzeSqlRepoDatasource({
    sourceText: `
      const datasource = 'log';
      export class SqlAuditRepo {
        protected readonly tableName = 'audit_logs';
      }
    `
  });
  assert.equal(sqlOutsideVarRes.hasLogDatasource, false);

  const sqlDynamicRes = analyzeSqlRepoDatasource({
    sourceText: `
      export class SqlAuditRepo {
        protected override readonly datasource = getDs();
      }
    `
  });
  assert.ok(sqlDynamicRes.errors.some((e) => e.includes('cannot statically resolve sql/repo.ts datasource')));

  // (a) Shorthand `const datasource = 'log'` WITHOUT `datasource = 'log'` in sql/repo.ts -> FAILS
  withTempDomain(
    {
      legacySchema: legacyLogSchema,
      newMongoSchema: shorthandLogSchema,
      extraFiles: {
        'repo.ts': `export const AuditRepoToken = defineRepoToken('Audit', { mongo, sql });\n`,
        'sql/repo.ts': `export class SqlAuditRepo { protected readonly tableName = 'audit_logs'; }\n`
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, '--allow-wip-slice1']);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /\[Structure\] Log domain .*sql\/repo\.ts must override readonly datasource = 'log'/);
    }
  );

  // (b) Same shorthand WITH matching `readonly datasource = 'log'` AND with `const DS = 'log'; readonly datasource = DS` -> PASSES
  withTempDomain(
    {
      legacySchema: legacyLogSchema,
      newMongoSchema: shorthandLogSchema,
      extraFiles: {
        'repo.ts': `export const AuditRepoToken = defineRepoToken('Audit', { mongo, sql });\n`,
        'sql/repo.ts': `export class SqlAuditRepo { protected override readonly datasource = 'log'; }\n`
      }
    },
    ({ domainDir, domainRel, legacyRel }) => {
      const resLiteral = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        '--allow-wip-slice1'
      ]);
      assert.equal(resLiteral.status, 0, resLiteral.stderr);

      fs.writeFileSync(
        path.join(domainDir, 'sql/repo.ts'),
        `const DS = 'log' as const;\nexport class SqlAuditRepo { protected override readonly datasource = DS; }\n`
      );
      const resConst = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        '--allow-wip-slice1'
      ]);
      assert.equal(resConst.status, 0, resConst.stderr);

      // Dynamic sql/repo.ts datasource must FAIL explicitly
      fs.writeFileSync(
        path.join(domainDir, 'sql/repo.ts'),
        `export class SqlAuditRepo { protected override readonly datasource = getDs(); }\n`
      );
      const resDynSql = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        '--allow-wip-slice1'
      ]);
      assert.equal(resDynSql.status, 1);
      assert.match(resDynSql.stderr, /cannot statically resolve sql\/repo\.ts datasource/);
    }
  );

  // (c) Dynamic unresolvable `datasource: getDs()` in mongo/schema.ts -> FAILS explicitly
  withTempDomain(
    {
      legacySchema: legacyLogSchema,
      newMongoSchema: dynamicDsSchema,
      extraFiles: {
        'repo.ts': `export const AuditRepoToken = defineRepoToken('Audit', { mongo, sql });\n`,
        'sql/repo.ts': `export class SqlAuditRepo { protected override readonly datasource = 'log'; }\n`
      }
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, '--allow-wip-slice1']);
      assert.equal(res.status, 1);
      assert.match(
        res.stderr,
        /\[Structure\] .*mongo\/schema\.ts: cannot statically resolve defineMongoCollection.*datasource "getDs\(\)"/
      );
    }
  );
});

test('Finding #18: rejects property-existence spoofs on real harnesses and requires executable registerLogTopologyContractSuite wiring', () => {
  const plainObjectSpoofTest = `
    import { describe, expect, it } from 'vitest';
    import { createContractBackends, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
    registerMultiDialectContractSuite({
      backends: createContractBackends({ collections: [logCol], tables: [logTable] }),
      registerTests: () => {
        it('fake plain object assertions', () => {
          expect({ logMode: 'shared' }).toEqual({ logMode: 'shared' });
          expect({ logMode: 'separate' }).toBeDefined();
        });
      }
    });
  `;

  // 精确复现 Codex 审查指出的绕过：分别创建真实 shared/separate PGlite harness，但只断言 expect(harness.logDb).toBeDefined()
  const realHarnessPropertySpoofTest = `
    import { describe, expect, it } from 'vitest';
    import {
      createContractBackends,
      createPGliteSqlTestHarness,
      registerMultiDialectContractSuite
    } from '@fastgpt/dal/db/testing';
    describe('property existence spoof on real PGlite harnesses', () => {
      it('only checks harness.logDb toBeDefined without log writes or isolation', async () => {
        const h1 = await createPGliteSqlTestHarness({ tables: [], logTables: [logTable], logMode: 'shared' });
        const h2 = await createPGliteSqlTestHarness({ tables: [], logTables: [logTable], logMode: 'separate' });
        expect(h1.logDb).toBeDefined();
        expect(h2.logDb).toBeDefined();
        await h1.close();
        await h2.close();
      });
    });
    registerMultiDialectContractSuite({
      backends: createContractBackends({ collections: [logCol], tables: [logTable] }),
      registerTests: () => {
        it('noop', () => { expect(true).toBe(true); });
      }
    });
  `;

  const shadowedMockCheck = analyzeLogDualModeTestCoverage({
    testFiles: [
      {
        relPath: 'mocked.contract.test.ts',
        raw: `
          const registerLogTopologyContractSuite = () => undefined;
          registerLogTopologyContractSuite({
            describeFn: describe,
            itFn: it,
            logCollections: [logCol],
            logTables: [logTable],
            mongoCollectionName: 'audit_logs',
            sqlTableName: 'audit_logs',
            writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
            readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
          });
        `
      }
    ]
  });
  assert.equal(shadowedMockCheck.ok, false);
  assert.match(shadowedMockCheck.details, /must import "registerLogTopologyContractSuite"/);

  const disabledFamilyCheck = analyzeLogDualModeTestCoverage({
    testFiles: [
      {
        relPath: 'disabled-family.contract.test.ts',
        raw: `
          import { describe, it } from 'vitest';
          import { injectRepo } from '@fastgpt/dal/db/container';
          import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
          registerLogTopologyContractSuite({
            describeFn: describe,
            itFn: it,
            logCollections: [logCol],
            logTables: [logTable],
            mongoCollectionName: 'audit_logs',
            sqlTableName: 'audit_logs',
            includeMongo: false,
            writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
            readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
          });
        `
      }
    ]
  });
  assert.equal(disabledFamilyCheck.ok, false);
  assert.match(disabledFamilyCheck.details, /must not disable "includeMongo: false"/);

  const skippedSuiteCheck = analyzeLogDualModeTestCoverage({
    testFiles: [
      {
        relPath: 'skipped-suite.contract.test.ts',
        raw: `
          import { describe, it } from 'vitest';
          import { injectRepo } from '@fastgpt/dal/db/container';
          import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
          describe.skip('skipped log suite', () => {
            registerLogTopologyContractSuite({
              describeFn: describe,
              itFn: it,
              logCollections: [logCol],
              logTables: [logTable],
              mongoCollectionName: 'audit_logs',
              sqlTableName: 'audit_logs',
              writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
              readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
            });
          });
        `
      }
    ]
  });
  assert.equal(skippedSuiteCheck.ok, false);

  const realDualModeTest = `
    import { afterAll, beforeAll, describe, expect, it } from 'vitest';
    import { injectRepo } from '@fastgpt/dal/db/container';
    import {
      createContractBackends,
      registerLogTopologyContractSuite,
      registerMultiDialectContractSuite
    } from '@fastgpt/dal/db/testing';
    import { AuditLogRepoToken } from '../repo';

    registerLogTopologyContractSuite({
      describeFn: describe,
      itFn: it,
      logCollections: [logCol],
      logTables: [logTable],
      mongoCollectionName: 'audit_logs',
      sqlTableName: 'audit_logs',
      writeLogRecord: async () => {
        const created = await injectRepo(AuditLogRepoToken).create({
          data: { teamId: '000000000000000000000001' }
        });
        return { id: created._id };
      },
      readLogRecord: async ({ id }) =>
        injectRepo(AuditLogRepoToken).findById({
          id,
          teamId: '000000000000000000000001'
        })
    });

    registerMultiDialectContractSuite({
      backends: createContractBackends({
        collections: [],
        logCollections: [logCol],
        tables: [],
        logTables: [logTable],
        logMode: 'separate'
      }),
      beforeAllFn: beforeAll,
      afterAllFn: afterAll,
      registerTests: () => {
        const repo = injectRepo(AuditLogRepoToken);
        it('creates and reads log entries', async () => {
          const created = await repo.create({ data: { teamId: '000000000000000000000001' } });
          expect(created._id).toBeDefined();
        });
      }
    });
  `;

  // Direct unit checks
  assert.equal(
    analyzeLogDualModeTestCoverage({
      testFiles: [{ relPath: 'fake.contract.test.ts', raw: plainObjectSpoofTest }]
    }).ok,
    false
  );
  assert.equal(
    analyzeLogDualModeTestCoverage({
      testFiles: [{ relPath: 'prop-spoof.contract.test.ts', raw: realHarnessPropertySpoofTest }]
    }).ok,
    false
  );
  assert.equal(
    analyzeLogDualModeTestCoverage({
      testFiles: [{ relPath: 'real-dual.contract.test.ts', raw: realDualModeTest }],
      domainRepoSymbols: new Set(['AuditLogRepoToken'])
    }).ok,
    true
  );

  // End-to-end CLI verification
  const tmpFakeAbs = path.join(repoRoot, 'packages/service/test/.finding18-plain-obj.contract.test.ts');
  const tmpPropSpoofAbs = path.join(repoRoot, 'packages/service/test/.finding18-prop-spoof.contract.test.ts');
  const tmpRealAbs = path.join(repoRoot, 'packages/service/test/.finding18-real-dual.contract.test.ts');
  try {
    fs.writeFileSync(tmpFakeAbs, plainObjectSpoofTest);
    fs.writeFileSync(tmpPropSpoofAbs, realHarnessPropertySpoofTest);
    fs.writeFileSync(tmpRealAbs, realDualModeTest);

    withTempDomain(
      {
        legacySchema: `
          defineIndex(S, { key: { teamId: 1 } });
          export const MongoAuditLog = getMongoLogModel('audit_logs', S);
        `,
        newMongoSchema: `
          export const auditLogCollection = defineMongoCollection({
            name: 'audit_logs',
            datasource: 'log',
            schema: S,
            indexes: [{ key: { teamId: 1 } }]
          });
        `,
        extraFiles: {
          'repo.ts': `export const AuditLogRepoToken = defineRepoToken('AuditLog', { mongo, sql });\n`,
          'sql/table.ts': `
            export const auditLogSqlTable = defineSqlTable({
              name: 'audit_logs',
              columns: {
                _id: { kind: 'entityId', primaryKey: true }
              }
            });
          `,
          'sql/repo.ts': `export class SqlAuditLogRepo { protected override readonly datasource = 'log'; }\n`
        }
      },
      ({ domainRel, legacyRel }) => {
        // (a) Plain object assertion spoof -> REJECTED
        const fakeRes = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1',
          '--no-test',
          '--test',
          'packages/service/test/.finding18-plain-obj.contract.test.ts'
        ]);
        assert.equal(fakeRes.status, 1);
        assert.match(fakeRes.stderr, /must register executable registerLogTopologyContractSuite\(/);

        // (b) Real PGlite harnesses with only `expect(h.logDb).toBeDefined()` -> REJECTED
        const propSpoofRes = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1',
          '--no-test',
          '--test',
          'packages/service/test/.finding18-prop-spoof.contract.test.ts'
        ]);
        assert.equal(propSpoofRes.status, 1);
        assert.match(propSpoofRes.stderr, /registerLogTopologyContractSuite/);

        // (c) Real registerLogTopologyContractSuite contract wiring -> PASSES
        const realRes = runVerify([
          '--dir',
          domainRel,
          '--legacy-schema',
          legacyRel,
          '--allow-wip-slice1',
          '--no-test',
          '--test',
          'packages/service/test/.finding18-real-dual.contract.test.ts'
        ]);
        assert.equal(realRes.status, 0, realRes.stderr);

        // (d) Split multi-file test suite: regular repo.contract.test.ts + dedicated log-topology.contract.test.ts + service.test.ts -> PASSES
        const splitCrudContractRel = 'packages/service/test/.split-crud.contract.test.ts';
        const splitTopologyContractRel = 'packages/service/test/.split-topology.contract.test.ts';
        const splitDisabledTopologyRel = 'packages/service/test/.split-bad-topology.contract.test.ts';
        const splitServiceTestRel = 'packages/service/test/.split-l0.service.test.ts';
        const splitCrudContractAbs = path.join(repoRoot, splitCrudContractRel);
        const splitTopologyContractAbs = path.join(repoRoot, splitTopologyContractRel);
        const splitDisabledTopologyAbs = path.join(repoRoot, splitDisabledTopologyRel);
        const splitServiceTestAbs = path.join(repoRoot, splitServiceTestRel);
        try {
          fs.writeFileSync(
            splitCrudContractAbs,
            `
              import { afterAll, beforeAll, describe, expect, it } from 'vitest';
              import { injectRepo } from '@fastgpt/dal/db/container';
              import { createContractBackends, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
              import { AuditLogRepoToken } from '../repo';

              registerMultiDialectContractSuite({
                backends: createContractBackends({
                  collections: [],
                  logCollections: [logCol],
                  tables: [],
                  logTables: [logTable],
                  logMode: 'separate'
                }),
                beforeAllFn: beforeAll,
                afterAllFn: afterAll,
                registerTests: () => {
                  const repo = injectRepo(AuditLogRepoToken);
                  it('creates and reads audit log entries', async () => {
                    const created = await repo.create({ data: { teamId: '000000000000000000000001' } });
                    expect(created._id).toBeDefined();
                  });
                }
              });
            `
          );
          fs.writeFileSync(
            splitTopologyContractAbs,
            `
              import { describe, it } from 'vitest';
              import { injectRepo } from '@fastgpt/dal/db/container';
              import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
              import { AuditLogRepoToken } from '../repo';

              registerLogTopologyContractSuite({
                describeFn: describe,
                itFn: it,
                logCollections: [logCol],
                logTables: [logTable],
                mongoCollectionName: 'audit_logs',
                sqlTableName: 'audit_logs',
                writeLogRecord: async () => {
                  const created = await injectRepo(AuditLogRepoToken).create({
                    data: { teamId: '000000000000000000000001' }
                  });
                  return { id: created._id };
                },
                readLogRecord: async ({ id }) =>
                  injectRepo(AuditLogRepoToken).findById({
                    id,
                    teamId: '000000000000000000000001'
                  })
              });
            `
          );
          fs.writeFileSync(
            splitDisabledTopologyAbs,
            `
              import { describe, it } from 'vitest';
              import { injectRepo } from '@fastgpt/dal/db/container';
              import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
              import { AuditLogRepoToken } from '../repo';

              registerLogTopologyContractSuite({
                describeFn: describe,
                itFn: it,
                logCollections: [logCol],
                logTables: [logTable],
                mongoCollectionName: 'audit_logs',
                sqlTableName: 'audit_logs',
                includeMongo: false,
                writeLogRecord: async () => {
                  const created = await injectRepo(AuditLogRepoToken).create({
                    data: { teamId: '000000000000000000000001' }
                  });
                  return { id: created._id };
                },
                readLogRecord: async ({ id }) =>
                  injectRepo(AuditLogRepoToken).findById({
                    id,
                    teamId: '000000000000000000000001'
                  })
              });
            `
          );
          fs.writeFileSync(
            splitServiceTestAbs,
            `
              import { describe, expect, it } from 'vitest';
              describe('AuditLog service L0 unit test', () => {
                it('checks service validation', () => {
                  expect(true).toBe(true);
                });
              });
            `
          );

          // Valid multi-file combination (regular CRUD contract + dedicated topology contract + L0 test) -> PASSES
          const splitPassRes = runVerify([
            '--dir',
            domainRel,
            '--legacy-schema',
            legacyRel,
            '--allow-wip-slice1',
            '--no-test',
            '--test',
            splitCrudContractRel,
            '--test',
            splitTopologyContractRel,
            '--test',
            splitServiceTestRel
          ]);
          assert.equal(splitPassRes.status, 0, splitPassRes.stderr);

          // Multi-file with NO log topology suite in any candidate file -> FAILS
          const splitMissingTopologyRes = runVerify([
            '--dir',
            domainRel,
            '--legacy-schema',
            legacyRel,
            '--allow-wip-slice1',
            '--no-test',
            '--test',
            splitCrudContractRel,
            '--test',
            splitServiceTestRel
          ]);
          assert.equal(splitMissingTopologyRes.status, 1);
          assert.match(
            splitMissingTopologyRes.stderr,
            /must register executable registerLogTopologyContractSuite\(/
          );

          // Multi-file where sibling has invalid topology (`includeMongo: false`) -> FAILS
          const splitBrokenTopologyRes = runVerify([
            '--dir',
            domainRel,
            '--legacy-schema',
            legacyRel,
            '--allow-wip-slice1',
            '--no-test',
            '--test',
            splitCrudContractRel,
            '--test',
            splitDisabledTopologyRel
          ]);
          assert.equal(splitBrokenTopologyRes.status, 1);
          assert.match(
            splitBrokenTopologyRes.stderr,
            /must not disable "includeMongo: false"/
          );

          // Dedicated log-topology file alone WITHOUT any multi-dialect CRUD/TX contract suite -> FAILS
          const topologyOnlyRes = runVerify([
            '--dir',
            domainRel,
            '--legacy-schema',
            legacyRel,
            '--allow-wip-slice1',
            '--no-test',
            '--test',
            splitTopologyContractRel
          ]);
          assert.equal(topologyOnlyRes.status, 1);
          assert.match(topologyOnlyRes.stderr, /must invoke registerDualDialectContractSuite/);

          // Skipped describeFn / itFn / local alias / describe.skipIf(...) MUST ALL FAIL (even alongside valid CRUD file)
          const skippedDescribeCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              { relPath: splitCrudContractRel, raw: fs.readFileSync(splitCrudContractAbs, 'utf8') },
              {
                relPath: 'skipped-describe-runner.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  registerLogTopologyContractSuite({
                    describeFn: describe.skip,
                    itFn: it,
                    logCollections: [logCol],
                    logTables: [logTable],
                    mongoCollectionName: 'audit_logs',
                    sqlTableName: 'audit_logs',
                    writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                    readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                  });
                `
              }
            ]
          });
          assert.equal(skippedDescribeCheck.ok, false);
          assert.match(skippedDescribeCheck.details, /must be direct un-skipped vitest "describe\/suite"/);

          const skippedItCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              { relPath: splitCrudContractRel, raw: fs.readFileSync(splitCrudContractAbs, 'utf8') },
              {
                relPath: 'skipped-it-runner.contract.test.ts',
                raw: `
                  import { describe, test } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  registerLogTopologyContractSuite({
                    describeFn: describe,
                    itFn: test.todo,
                    logCollections: [logCol],
                    logTables: [logTable],
                    mongoCollectionName: 'audit_logs',
                    sqlTableName: 'audit_logs',
                    writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                    readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                  });
                `
              }
            ]
          });
          assert.equal(skippedItCheck.ok, false);
          assert.match(skippedItCheck.details, /must be direct un-skipped vitest "it\/test"/);

          const localAliasRunnerCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              {
                relPath: 'alias-runner.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  const skippedDesc = describe.skip;
                  registerLogTopologyContractSuite({
                    describeFn: skippedDesc,
                    itFn: () => undefined,
                    logCollections: [logCol],
                    logTables: [logTable],
                    mongoCollectionName: 'audit_logs',
                    sqlTableName: 'audit_logs',
                    writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                    readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                  });
                `
              }
            ]
          });
          assert.equal(localAliasRunnerCheck.ok, false);
          assert.match(localAliasRunnerCheck.details, /is shadowed by local binding|must be imported from "vitest"/);

          const skipIfWrapperCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              {
                relPath: 'skip-if-wrapper.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  describe.skipIf(true)('conditionally skipped', () => {
                    registerLogTopologyContractSuite({
                      describeFn: describe,
                      itFn: it,
                      logCollections: [logCol],
                      logTables: [logTable],
                      mongoCollectionName: 'audit_logs',
                      sqlTableName: 'audit_logs',
                      writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                      readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                    });
                  });
                `
              }
            ]
          });
          assert.equal(skipIfWrapperCheck.ok, false);
          assert.match(skipIfWrapperCheck.details, /inside skipped test block/);

          // CLI end-to-end rejection when combined with valid CRUD contract file
          fs.writeFileSync(
            splitDisabledTopologyAbs,
            `
              import { describe, it } from 'vitest';
              import { injectRepo } from '@fastgpt/dal/db/container';
              import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
              import { AuditLogRepoToken } from '../repo';

              registerLogTopologyContractSuite({
                describeFn: describe.skip,
                itFn: it,
                logCollections: [logCol],
                logTables: [logTable],
                mongoCollectionName: 'audit_logs',
                sqlTableName: 'audit_logs',
                writeLogRecord: async () => {
                  const created = await injectRepo(AuditLogRepoToken).create({
                    data: { teamId: '000000000000000000000001' }
                  });
                  return { id: created._id };
                },
                readLogRecord: async ({ id }) =>
                  injectRepo(AuditLogRepoToken).findById({
                    id,
                    teamId: '000000000000000000000001'
                  })
              });
            `
          );
          const splitSkippedDescribeCliRes = runVerify([
            '--dir',
            domainRel,
            '--legacy-schema',
            legacyRel,
            '--allow-wip-slice1',
            '--no-test',
            '--test',
            splitCrudContractRel,
            '--test',
            splitDisabledTopologyRel
          ]);
          assert.equal(splitSkippedDescribeCliRes.status, 1);
          assert.match(
            splitSkippedDescribeCliRes.stderr,
            /must be direct un-skipped vitest "describe\/suite"/
          );

          // Conditional / env-gated registration MUST FAIL statically even when valid sibling files exist
          const envBlockGatedCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              { relPath: splitCrudContractRel, raw: fs.readFileSync(splitCrudContractAbs, 'utf8') },
              {
                relPath: 'env-block-gated.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  if (process.env.ENABLE_LOG_TOPOLOGY === '1') {
                    registerLogTopologyContractSuite({
                      describeFn: describe,
                      itFn: it,
                      logCollections: [logCol],
                      logTables: [logTable],
                      mongoCollectionName: 'audit_logs',
                      sqlTableName: 'audit_logs',
                      writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                      readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                    });
                  }
                `
              }
            ]
          });
          assert.equal(envBlockGatedCheck.ok, false);
          assert.match(envBlockGatedCheck.details, /must be registered unconditionally/);

          const bracelessIfGatedCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              {
                relPath: 'env-braceless-if.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  if (process.env.ENABLE_LOG_TOPOLOGY === '1') registerLogTopologyContractSuite({
                    describeFn: describe,
                    itFn: it,
                    logCollections: [logCol],
                    logTables: [logTable],
                    mongoCollectionName: 'audit_logs',
                    sqlTableName: 'audit_logs',
                    writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                    readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                  });
                `
              }
            ]
          });
          assert.equal(bracelessIfGatedCheck.ok, false);
          assert.match(bracelessIfGatedCheck.details, /must be registered unconditionally/);

          const shortCircuitGatedCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              {
                relPath: 'env-and-gated.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  process.env.ENABLE_LOG_TOPOLOGY === '1' && registerLogTopologyContractSuite({
                    describeFn: describe,
                    itFn: it,
                    logCollections: [logCol],
                    logTables: [logTable],
                    mongoCollectionName: 'audit_logs',
                    sqlTableName: 'audit_logs',
                    writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                    readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                  });
                `
              }
            ]
          });
          assert.equal(shortCircuitGatedCheck.ok, false);
          assert.match(shortCircuitGatedCheck.details, /must be registered unconditionally/);

          const envWrappedDescribeCheck = analyzeLogDualModeTestCoverage({
            domainRepoSymbols: new Set(['AuditLogRepoToken']),
            testFiles: [
              {
                relPath: 'env-describe-gated.contract.test.ts',
                raw: `
                  import { describe, it } from 'vitest';
                  import { injectRepo } from '@fastgpt/dal/db/container';
                  import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
                  if (process.env.CI) {
                    describe('AuditLog log topology', () => {
                      registerLogTopologyContractSuite({
                        describeFn: describe,
                        itFn: it,
                        logCollections: [logCol],
                        logTables: [logTable],
                        mongoCollectionName: 'audit_logs',
                        sqlTableName: 'audit_logs',
                        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({ data: { teamId: '000000000000000000000001' } }),
                        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id, teamId: '000000000000000000000001' })
                      });
                    });
                  }
                `
              }
            ]
          });
          assert.equal(envWrappedDescribeCheck.ok, false);
          assert.match(envWrappedDescribeCheck.details, /must be registered unconditionally/);

          // Runtime JSON execution report verification: binds both file identity and target suite titles
          const auditExpectedSuites = [
            {
              relPath: splitTopologyContractRel,
              mongoCollectionName: 'audit_logs',
              sqlTableName: 'audit_logs'
            }
          ];
          const auditRequiredCases = buildRequiredLogTopologyCases({
            mongoCollectionName: 'audit_logs',
            sqlTableName: 'audit_logs'
          });
          const missingRuntimeCases = verifyExecutedLogTopologyReports({
            repoRoot,
            expectedSuites: auditExpectedSuites,
            reports: [
              {
                testResults: [
                  {
                    name: path.join(repoRoot, splitTopologyContractRel),
                    assertionResults: [
                      {
                        ancestorTitles: ['AuditLog contract'],
                        title: 'creates and reads entries',
                        status: 'passed'
                      }
                    ]
                  }
                ]
              }
            ]
          });
          assert.equal(missingRuntimeCases.ok, false);
          assert.equal(missingRuntimeCases.missingOrNotPassed.length, 4);

          const skippedRuntimeCases = verifyExecutedLogTopologyReports({
            repoRoot,
            expectedSuites: auditExpectedSuites,
            reports: [
              {
                testResults: [
                  {
                    name: path.join(repoRoot, splitTopologyContractRel),
                    assertionResults: [
                      {
                        ancestorTitles: [auditRequiredCases[0].suiteTitle],
                        title: auditRequiredCases[0].caseTitle,
                        status: 'skipped'
                      },
                      {
                        ancestorTitles: [auditRequiredCases[1].suiteTitle],
                        title: auditRequiredCases[1].caseTitle,
                        status: 'passed'
                      },
                      {
                        ancestorTitles: [auditRequiredCases[2].suiteTitle],
                        title: auditRequiredCases[2].caseTitle,
                        status: 'passed'
                      },
                      {
                        ancestorTitles: [auditRequiredCases[3].suiteTitle],
                        title: auditRequiredCases[3].caseTitle,
                        status: 'passed'
                      }
                    ]
                  }
                ]
              }
            ]
          });
          assert.equal(skippedRuntimeCases.ok, false);
          assert.equal(skippedRuntimeCases.missingOrNotPassed.length, 1);
          assert.match(skippedRuntimeCases.missingOrNotPassed[0], /^skipped:/);

          const validRuntimeCases = verifyExecutedLogTopologyReports({
            repoRoot,
            expectedSuites: auditExpectedSuites,
            reports: [
              {
                testResults: [
                  {
                    name: path.join(repoRoot, splitCrudContractRel),
                    assertionResults: [
                      {
                        ancestorTitles: ['AuditLog'],
                        title: 'normal crud',
                        status: 'passed'
                      }
                    ]
                  }
                ]
              },
              {
                testResults: [
                  {
                    name: path.join(repoRoot, splitTopologyContractRel),
                    assertionResults: auditRequiredCases.map((req) => ({
                      ancestorTitles: ['Outer', req.suiteTitle],
                      title: req.caseTitle,
                      status: 'passed'
                    }))
                  }
                ]
              }
            ]
          });
          assert.equal(validRuntimeCases.ok, true);
          assert.equal(validRuntimeCases.passedCases.length, 4);
        } finally {
          fs.rmSync(splitCrudContractAbs, { force: true });
          fs.rmSync(splitTopologyContractAbs, { force: true });
          fs.rmSync(splitDisabledTopologyAbs, { force: true });
          fs.rmSync(splitServiceTestAbs, { force: true });
        }
      }
    );
  } finally {
    fs.rmSync(tmpFakeAbs, { force: true });
    fs.rmSync(tmpPropSpoofAbs, { force: true });
    fs.rmSync(tmpRealAbs, { force: true });
  }
});

test('Finding #21: SQL static validation is scope-aware and rejects shadowed function parameters and inner block bindings', () => {
  // (a1) Shadowed function parameter `defaultVal` hiding outer safe `const defaultVal = undefined`
  const shadowedParamDefault = analyzeSqlTableDefinitions(`
    const defaultVal = undefined;
    export function buildTable(defaultVal: string) {
      return defineSqlTable({
        name: 'shadowed_default',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          body: { kind: 'text', defaultValue: defaultVal }
        }
      });
    }
  `);
  assert.ok(
    shadowedParamDefault.issues.some((i) =>
      i.includes('identifier "defaultVal" is dynamically bound / shadowed by function parameter')
    ),
    JSON.stringify(shadowedParamDefault.issues)
  );

  // (a2) Shadowed arrow-function & destructured parameter `colDef`
  const shadowedArrowParam = analyzeSqlTableDefinitions(`
    const colDef = { kind: 'varchar', length: 64 } as const;
    export const buildExpr = ({ col: colDef }: { col: any }) =>
      defineSqlTable({
        name: 'shadowed_arrow',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          body: colDef
        }
      });
  `);
  assert.ok(
    shadowedArrowParam.issues.some((i) =>
      i.includes('identifier "colDef" is dynamically bound / shadowed by arrow function parameter')
    ),
    JSON.stringify(shadowedArrowParam.issues)
  );

  // (a3) Shadowed index name parameter (must NOT leak through allowOpaqueIdentifier)
  const shadowedIndexName = analyzeSqlTableDefinitions(`
    const idxName = 'fg_safe_idx';
    export const buildIdx = (idxName: string) =>
      defineSqlTable({
        name: 'shadowed_idx',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          code: { kind: 'varchar', length: 64 }
        },
        indexes: [{ name: idxName, columns: ['code'] }]
      });
  `);
  assert.ok(
    shadowedIndexName.issues.some((i) =>
      i.includes('identifier "idxName" is dynamically bound / shadowed by arrow function parameter')
    ),
    JSON.stringify(shadowedIndexName.issues)
  );

  // (b1) Shadowed inner block `let` binding
  const shadowedInnerLet = analyzeSqlTableDefinitions(`
    const colDef = { kind: 'varchar', length: 64 } as const;
    {
      let colDef = { kind: 'varchar', length: 64 };
      colDef = getRuntimeCol();
      defineSqlTable({
        name: 'shadowed_let',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          body: colDef
        }
      });
    }
  `);
  assert.ok(
    shadowedInnerLet.issues.some((i) =>
      i.includes('identifier "colDef" is dynamically bound / shadowed by let declaration')
    ),
    JSON.stringify(shadowedInnerLet.issues)
  );

  // (b2) Shadowed inner block `const` with dynamic initializer (must NOT fall back to outer safe const)
  const shadowedInnerDynamicConst = analyzeSqlTableDefinitions(`
    const colDef = { kind: 'varchar', length: 64 } as const;
    {
      const colDef = buildColAtRuntime();
      defineSqlTable({
        name: 'shadowed_inner_const',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          body: colDef
        }
      });
    }
  `);
  assert.ok(
    shadowedInnerDynamicConst.issues.some((i) =>
      i.includes('non-static expression "buildColAtRuntime()"')
    ),
    JSON.stringify(shadowedInnerDynamicConst.issues)
  );

  // (c) Legitimate unshadowed outer const (even when an unrelated sibling function has a same-named param) -> PASSES
  const validOuterConst = analyzeSqlTableDefinitions(`
    const safeCol = { kind: 'varchar', length: 64 } as const;
    export const unrelatedHelper = (safeCol: string) => safeCol.trim();
    export const okTable = defineSqlTable({
      name: 'ok_outer_const',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        title: safeCol
      },
      indexes: [{ name: 'fg_ok_title', columns: ['title'] }]
    });
  `);
  assert.deepEqual(validOuterConst.issues, []);

  // End-to-end CLI verification for shadowed function parameter vs legitimate outer const
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { teamId: 1 } });`,
      newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
      extraFiles: {
        'sql/table.ts': `
          const colDef = { kind: 'varchar', length: 64 } as const;
          export function makeTable(colDef: any) {
            return defineSqlTable({
              name: 'shadowed_cli',
              columns: {
                _id: { kind: 'entityId', primaryKey: true },
                body: colDef
              }
            });
          }
        `
      }
    },
    ({ domainDir, domainRel, legacyRel }) => {
      const badRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(badRes.status, 1);
      assert.match(badRes.stderr, /shadowed by function parameter/);

      fs.writeFileSync(
        path.join(domainDir, 'sql/table.ts'),
        `
          const colDef = { kind: 'varchar', length: 64 } as const;
          export const okTable = defineSqlTable({
            name: 'unshadowed_cli',
            columns: {
              _id: { kind: 'entityId', primaryKey: true },
              title: colDef
            },
            indexes: [{ name: 'fg_unshadowed_title', columns: ['title'] }]
          });
        `
      );
      const okRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(okRes.status, 0, okRes.stderr);
    }
  );
});

test('supports --domain and --no-test flags and recognizes both service.unit.test.ts and service.test.ts as valid Service L0 unit tests', () => {
  // 1. Real pilot appRegistration via --domain and --no-test
  const pilotRes = runVerify([
    '--domain',
    'packages/dal/db/repos/appRegistration',
    '--no-test'
  ]);
  assert.equal(pilotRes.status, 0, pilotRes.stderr);
  assert.match(pilotRes.stdout, /Domain verification PASSED for packages\/dal\/db\/repos\/appRegistration/);
  assert.doesNotMatch(pilotRes.stdout, /No Service L0 unit test found/);

  // 2. Both service.unit.test.ts and service.test.ts are recognized in DAL -> service paired lookup
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-service-unit-probe-'));
  try {
    fs.writeFileSync(path.join(tmpRoot, 'pnpm-workspace.yaml'), 'packages: []\n');
    const dalDir = path.join(tmpRoot, 'packages/dal/db/repos/demoPilot');
    const dalTestDir = path.join(tmpRoot, 'packages/dal/test/db/repos/demoPilot');
    const svcDir = path.join(tmpRoot, 'packages/service/support/demoPilot');
    const svcTestDir = path.join(tmpRoot, 'packages/service/test/support/demoPilot');

    fs.mkdirSync(path.join(dalDir, 'mongo'), { recursive: true });
    fs.mkdirSync(path.join(dalDir, 'sql'), { recursive: true });
    fs.mkdirSync(dalTestDir, { recursive: true });
    fs.mkdirSync(svcDir, { recursive: true });
    fs.mkdirSync(svcTestDir, { recursive: true });

    fs.writeFileSync(path.join(dalDir, 'repo.type.ts'), 'export type DemoRepo = {};\n');
    fs.writeFileSync(path.join(dalDir, 'repo.ts'), 'export const DemoToken = defineRepoToken("Demo", { mongo, sql });\n');
    fs.writeFileSync(
      path.join(dalDir, 'mongo/schema.ts'),
      `export const demoCol = defineMongoCollection({ name: 'demos', datasource: 'main', schema: S, indexes: [{ key: { teamId: 1 } }] });\n`
    );
    fs.writeFileSync(path.join(dalDir, 'mongo/repo.ts'), 'export class MongoDemoRepo {}\n');
    fs.writeFileSync(
      path.join(dalDir, 'sql/table.ts'),
      `export const demoTable = defineSqlTable({ name: 'demos', columns: { _id: { kind: 'entityId', primaryKey: true } } });\n`
    );
    fs.writeFileSync(path.join(dalDir, 'sql/repo.ts'), 'export class SqlDemoRepo {}\n');
    fs.writeFileSync(
      path.join(dalTestDir, 'repo.contract.test.ts'),
      `registerMultiDialectContractSuite({ backends: [], registerTests: () => { it('ok', () => { expect(1).toBe(1); }); } });\n`
    );
    fs.writeFileSync(path.join(svcDir, 'service.ts'), 'export class DemoService {}\n');

    // (a) service.unit.test.ts recognized cleanly
    fs.writeFileSync(
      path.join(svcTestDir, 'service.unit.test.ts'),
      `describe('DemoService', () => { it('works', () => { expect(1).toBe(1); }); });\n`
    );
    const unitLookup = findDomainServiceUnitTestFiles({
      repoRoot: tmpRoot,
      domainRel: 'packages/dal/db/repos/demoPilot'
    });
    assert.deepEqual(unitLookup.unitTestFiles, [
      'packages/service/test/support/demoPilot/service.unit.test.ts'
    ]);
    const unitCliRes = runVerify(
      ['--domain', 'packages/dal/db/repos/demoPilot', '--no-test'],
      { cwd: tmpRoot }
    );
    assert.equal(unitCliRes.status, 0, unitCliRes.stderr);
    assert.doesNotMatch(unitCliRes.stdout, /No Service L0 unit test found/);

    // (b) Empty shell service.unit.test.ts fails governance check
    fs.writeFileSync(
      path.join(svcTestDir, 'service.unit.test.ts'),
      `export const placeholder = true;\n`
    );
    const emptyUnitRes = runVerify(
      ['--domain', 'packages/dal/db/repos/demoPilot', '--no-test'],
      { cwd: tmpRoot }
    );
    assert.equal(emptyUnitRes.status, 1);
    assert.match(emptyUnitRes.stderr, /Service L0 unit test .*service\.unit\.test\.ts must declare executable test case/);

    // (c) service.test.ts also recognized cleanly
    fs.rmSync(path.join(svcTestDir, 'service.unit.test.ts'));
    fs.writeFileSync(
      path.join(svcTestDir, 'service.test.ts'),
      `describe('DemoService', () => { it('works', () => { expect(1).toBe(1); }); });\n`
    );
    const legacyNameLookup = findDomainServiceUnitTestFiles({
      repoRoot: tmpRoot,
      domainRel: 'packages/dal/db/repos/demoPilot'
    });
    assert.deepEqual(legacyNameLookup.unitTestFiles, [
      'packages/service/test/support/demoPilot/service.test.ts'
    ]);
    const legacyNameCliRes = runVerify(
      ['--domain', 'packages/dal/db/repos/demoPilot', '--no-test'],
      { cwd: tmpRoot }
    );
    assert.equal(legacyNameCliRes.status, 0, legacyNameCliRes.stderr);
    assert.doesNotMatch(legacyNameCliRes.stdout, /No Service L0 unit test found/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('binds log topology static checks, CRUD provenance, execution plan, and real registerLogTopologyContractSuite Vitest JSON reports to the target domain', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-log-domain-binding-'));
  const vitestProbeRelBilling = 'packages/dal/test/db/.billing-log-topology-probe.test.ts';
  const vitestProbeRelAudit = 'packages/dal/test/db/.audit-log-topology-probe.test.ts';
  const vitestProbeAbsBilling = path.join(repoRoot, vitestProbeRelBilling);
  const vitestProbeAbsAudit = path.join(repoRoot, vitestProbeRelAudit);
  const billingReportJsonAbs = path.join(tmpRoot, 'vitest-billing-only.json');
  const bothReportJsonAbs = path.join(tmpRoot, 'vitest-both.json');

  try {
    fs.writeFileSync(path.join(tmpRoot, 'pnpm-workspace.yaml'), 'packages: []\n');

    const auditRel = 'packages/dal/db/repos/auditLogProbe';
    const auditAbs = path.join(tmpRoot, auditRel);
    const auditTestDirRel = 'packages/dal/test/db/repos/auditLogProbe';
    const auditTestDirAbs = path.join(tmpRoot, auditTestDirRel);
    const billingRel = 'packages/dal/db/repos/billingLogProbe';
    const billingAbs = path.join(tmpRoot, billingRel);
    const billingTestDirRel = 'packages/dal/test/db/repos/billingLogProbe';
    const billingTestDirAbs = path.join(tmpRoot, billingTestDirRel);
    const mainOrderRel = 'packages/dal/db/repos/mainOrderProbe';
    const mainOrderAbs = path.join(tmpRoot, mainOrderRel);
    const mainOrderTestDirRel = 'packages/dal/test/db/repos/mainOrderProbe';
    const mainOrderTestDirAbs = path.join(tmpRoot, mainOrderTestDirRel);
    const collisionRel = 'packages/dal/db/repos/collisionLogProbe';
    const collisionAbs = path.join(tmpRoot, collisionRel);
    const collisionTestDirRel = 'packages/dal/test/db/repos/collisionLogProbe';
    const collisionTestDirAbs = path.join(tmpRoot, collisionTestDirRel);

    for (const dir of [
      path.join(auditAbs, 'mongo'),
      path.join(auditAbs, 'sql'),
      auditTestDirAbs,
      path.join(billingAbs, 'mongo'),
      path.join(billingAbs, 'sql'),
      billingTestDirAbs,
      path.join(mainOrderAbs, 'mongo'),
      path.join(mainOrderAbs, 'sql'),
      mainOrderTestDirAbs,
      path.join(collisionAbs, 'mongo'),
      path.join(collisionAbs, 'sql'),
      collisionTestDirAbs
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Domain A: auditLog -> audit_logs / AuditLogRepoToken
    fs.writeFileSync(path.join(auditAbs, 'repo.type.ts'), 'export type AuditLogRepo = {};\n');
    fs.writeFileSync(
      path.join(auditAbs, 'repo.ts'),
      `export const AuditLogRepoToken = defineRepoToken('AuditLog', { mongo, sql });\n`
    );
    fs.writeFileSync(
      path.join(auditAbs, 'mongo/schema.ts'),
      `
        export const auditLogCollection = defineMongoCollection({
          name: 'audit_logs',
          datasource: 'log',
          schema: AuditSchema,
          indexes: [{ key: { teamId: 1 } }]
        });
      `
    );
    fs.writeFileSync(
      path.join(auditAbs, 'mongo/repo.ts'),
      'export class MongoAuditLogRepo {}\n'
    );
    fs.writeFileSync(
      path.join(auditAbs, 'sql/table.ts'),
      `
        export const auditLogSqlTable = defineSqlTable({
          name: 'audit_logs',
          columns: { _id: { kind: 'entityId', primaryKey: true } }
        });
      `
    );
    fs.writeFileSync(
      path.join(auditAbs, 'sql/repo.ts'),
      `export class SqlAuditLogRepo { protected override readonly datasource = 'log'; }\n`
    );

    // Domain B: billingLog -> billing_logs / BillingLogRepoToken
    fs.writeFileSync(path.join(billingAbs, 'repo.type.ts'), 'export type BillingLogRepo = {};\n');
    fs.writeFileSync(
      path.join(billingAbs, 'repo.ts'),
      `export const BillingLogRepoToken = defineRepoToken('BillingLog', { mongo, sql });\n`
    );
    fs.writeFileSync(
      path.join(billingAbs, 'mongo/schema.ts'),
      `
        export const billingLogCollection = defineMongoCollection({
          name: 'billing_logs',
          datasource: 'log',
          schema: BillingSchema,
          indexes: [{ key: { teamId: 1 } }]
        });
      `
    );
    fs.writeFileSync(
      path.join(billingAbs, 'mongo/repo.ts'),
      'export class MongoBillingLogRepo {}\n'
    );
    fs.writeFileSync(
      path.join(billingAbs, 'sql/table.ts'),
      `
        export const billingLogSqlTable = defineSqlTable({
          name: 'billing_logs',
          columns: { _id: { kind: 'entityId', primaryKey: true } }
        });
      `
    );
    fs.writeFileSync(
      path.join(billingAbs, 'sql/repo.ts'),
      `export class SqlBillingLogRepo { protected override readonly datasource = 'log'; }\n`
    );

    // Domain C: main-DB domain without any repo.contract.test.ts yet
    fs.writeFileSync(path.join(mainOrderAbs, 'repo.type.ts'), 'export type MainOrderRepo = {};\n');
    fs.writeFileSync(
      path.join(mainOrderAbs, 'repo.ts'),
      `export const MainOrderRepoToken = defineRepoToken('MainOrder', { mongo, sql });\n`
    );
    fs.writeFileSync(
      path.join(mainOrderAbs, 'mongo/schema.ts'),
      `
        export const mainOrderCollection = defineMongoCollection({
          name: 'main_orders',
          datasource: 'main',
          schema: OrderSchema,
          indexes: [{ key: { teamId: 1 } }]
        });
      `
    );
    fs.writeFileSync(path.join(mainOrderAbs, 'mongo/repo.ts'), 'export class MongoMainOrderRepo {}\n');
    fs.writeFileSync(
      path.join(mainOrderAbs, 'sql/table.ts'),
      `
        export const mainOrderSqlTable = defineSqlTable({
          name: 'main_orders',
          columns: { _id: { kind: 'entityId', primaryKey: true } }
        });
      `
    );
    fs.writeFileSync(path.join(mainOrderAbs, 'sql/repo.ts'), 'export class SqlMainOrderRepo {}\n');

    // Domain D: collisionLog exporting same symbol name `AuditLogRepoToken` from another domain path
    fs.writeFileSync(path.join(collisionAbs, 'repo.type.ts'), 'export type CollisionLogRepo = {};\n');
    fs.writeFileSync(
      path.join(collisionAbs, 'repo.ts'),
      `export const AuditLogRepoToken = defineRepoToken('CollisionLog', { mongo, sql });\n`
    );
    fs.writeFileSync(
      path.join(collisionAbs, 'mongo/schema.ts'),
      `
        export const collisionCollection = defineMongoCollection({
          name: 'collision_logs',
          datasource: 'log',
          schema: CollisionSchema,
          indexes: [{ key: { teamId: 1 } }]
        });
      `
    );
    fs.writeFileSync(path.join(collisionAbs, 'mongo/repo.ts'), 'export class MongoCollisionLogRepo {}\n');
    fs.writeFileSync(
      path.join(collisionAbs, 'sql/table.ts'),
      `
        export const collisionSqlTable = defineSqlTable({
          name: 'collision_logs',
          columns: { _id: { kind: 'entityId', primaryKey: true } }
        });
      `
    );
    fs.writeFileSync(
      path.join(collisionAbs, 'sql/repo.ts'),
      `export class SqlCollisionLogRepo { protected override readonly datasource = 'log'; }\n`
    );

    const auditCrudContractRel = `${auditTestDirRel}/repo.contract.test.ts`;
    const auditDedicatedTopologyRel = `${auditTestDirRel}/log-topology.contract.test.ts`;
    const billingContractRel = `${billingTestDirRel}/repo.contract.test.ts`;
    const billingDedicatedTopologyRel = `${billingTestDirRel}/log-topology.contract.test.ts`;
    const mainOrderDummyTopoRel = `${mainOrderTestDirRel}/extra.contract.test.ts`;
    const collisionContractRel = `${collisionTestDirRel}/repo.contract.test.ts`;

    const auditCrudOnlySource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { createContractBackends, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
      import { auditLogCollection } from '../../../../db/repos/auditLogProbe/mongo/schema';
      import { auditLogSqlTable } from '../../../../db/repos/auditLogProbe/sql/table';
      import { AuditLogRepoToken } from '@fastgpt/dal/db/repos/auditLogProbe/repo';
      registerMultiDialectContractSuite({
        backends: createContractBackends({ collections: [], logCollections: [auditLogCollection], tables: [], logTables: [auditLogSqlTable], logMode: 'separate' }),
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          const repo = injectRepo(AuditLogRepoToken);
          it('creates audit log entries', async () => {
            expect(await repo.create({})).toBeDefined();
          });
        }
      });
    `;

    // Note: BOTH billingFullSource and billingDedicatedTopologySource use imported `.name` descriptors!
    const billingFullSource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { createContractBackends, registerLogTopologyContractSuite, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
      import { billingLogCollection } from '../../../../db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '@fastgpt/dal/db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';
      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [billingLogCollection],
        logTables: [billingLogSqlTable],
        mongoCollectionName: billingLogCollection.name,
        sqlTableName: billingLogSqlTable.name,
        writeLogRecord: async () => injectRepo(BillingLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(BillingLogRepoToken).findById({ id })
      });
      registerMultiDialectContractSuite({
        backends: createContractBackends({ collections: [], logCollections: [billingLogCollection], tables: [], logTables: [billingLogSqlTable], logMode: 'separate' }),
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          const repo = injectRepo(BillingLogRepoToken);
          it('creates billing log entries', async () => {
            expect(await repo.create({})).toBeDefined();
          });
        }
      });
    `;

    const billingCrudOnlySource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { createContractBackends, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
      import { billingLogCollection } from '@fastgpt/dal/db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '../../../../db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';
      registerMultiDialectContractSuite({
        backends: createContractBackends({ collections: [], logCollections: [billingLogCollection], tables: [], logTables: [billingLogSqlTable], logMode: 'separate' }),
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          const repo = injectRepo(BillingLogRepoToken);
          it('creates billing log entries', async () => {
            expect(await repo.create({})).toBeDefined();
          });
        }
      });
    `;

    const billingDedicatedTopologySource = `
      import { describe, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
      import { billingLogCollection } from '../../../../db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '@fastgpt/dal/db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';
      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [billingLogCollection],
        logTables: [billingLogSqlTable],
        mongoCollectionName: billingLogCollection.name,
        sqlTableName: billingLogSqlTable.name,
        writeLogRecord: async () => injectRepo(BillingLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(BillingLogRepoToken).findById({ id })
      });
    `;

    const auditDedicatedTopologySource = `
      import { describe, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
      import { auditLogCollection } from '../../../../db/repos/auditLogProbe/mongo/schema';
      import { auditLogSqlTable } from '@fastgpt/dal/db/repos/auditLogProbe/sql/table';
      import { AuditLogRepoToken } from '../../../../db/repos/auditLogProbe/repo';
      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [auditLogCollection],
        logTables: [auditLogSqlTable],
        mongoCollectionName: auditLogCollection.name,
        sqlTableName: auditLogSqlTable.name,
        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
      });
    `;

    const collisionContractSource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import { createContractBackends, registerLogTopologyContractSuite, registerMultiDialectContractSuite } from '@fastgpt/dal/db/testing';
      import { collisionCollection } from '../../../../db/repos/collisionLogProbe/mongo/schema';
      import { collisionSqlTable } from '../../../../db/repos/collisionLogProbe/sql/table';
      import { AuditLogRepoToken } from '../../../../db/repos/collisionLogProbe/repo';
      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [collisionCollection],
        logTables: [collisionSqlTable],
        mongoCollectionName: collisionCollection.name,
        sqlTableName: collisionSqlTable.name,
        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
      });
      registerMultiDialectContractSuite({
        backends: createContractBackends({ collections: [], logCollections: [collisionCollection], tables: [], logTables: [collisionSqlTable], logMode: 'separate' }),
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          const repo = injectRepo(AuditLogRepoToken);
          it('creates collision entries', async () => {
            expect(await repo.create({})).toBeDefined();
          });
        }
      });
    `;

    fs.writeFileSync(path.join(tmpRoot, auditCrudContractRel), auditCrudOnlySource);
    fs.writeFileSync(path.join(tmpRoot, billingContractRel), billingFullSource);
    fs.writeFileSync(path.join(tmpRoot, billingDedicatedTopologyRel), billingDedicatedTopologySource);
    fs.writeFileSync(path.join(tmpRoot, collisionContractRel), collisionContractSource);

    // 1. Static negative: verifying auditLog with CRUD-only audit file + full billingLog (using `.name` descriptors) MUST FAIL
    const auditMongoInfo = analyzeMongoSchemaDatasource({
      sourceText: fs.readFileSync(path.join(auditAbs, 'mongo/schema.ts'), 'utf8'),
      repoRoot: tmpRoot,
      sourceRelPath: `${auditRel}/mongo/schema.ts`
    });
    const auditSqlInfo = analyzeSqlTableDefinitions(
      fs.readFileSync(path.join(auditAbs, 'sql/table.ts'), 'utf8'),
      { repoRoot: tmpRoot, sourceRelPath: `${auditRel}/sql/table.ts` }
    );
    const crossDomainSubstituteStatic = analyzeLogDualModeTestCoverage({
      testFiles: [
        { relPath: auditCrudContractRel, raw: auditCrudOnlySource },
        { relPath: billingContractRel, raw: billingFullSource }
      ],
      domainRel: auditRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken', 'MongoAuditLogRepo', 'SqlAuditLogRepo']),
      domainMongoCollections: new Set(auditMongoInfo.logCollectionNames),
      domainSqlTables: new Set(auditSqlInfo.tables.map((t) => t.name)),
      domainCollectionExportNames: auditMongoInfo.collectionExportNames,
      domainTableExportNames: auditSqlInfo.tableExportNames,
      domainTestDir: auditTestDirRel,
      repoRoot: tmpRoot
    });
    assert.equal(crossDomainSubstituteStatic.ok, false);
    assert.deepEqual(crossDomainSubstituteStatic.validSuiteEntries, []);
    assert.deepEqual(crossDomainSubstituteStatic.otherDomainValidSuiteFiles, [billingContractRel]);
    assert.match(
      crossDomainSubstituteStatic.details,
      /only other-domain log topology suite\(s\) were provided/
    );

    const cliSubstituteRes = runVerify(
      ['--domain', auditRel, '--no-test', '--test', billingContractRel],
      { cwd: tmpRoot }
    );
    assert.equal(cliSubstituteRes.status, 1);
    assert.match(cliSubstituteRes.stderr, /only other-domain log topology suite\(s\) were provided/);

    // 1b. Same-name symbol collision (`AuditLogRepoToken` imported from collisionLogProbe) must NOT fool CRUD or topology attribution
    const collisionCrudCheck = analyzeMultiDialectContractCoverage({
      testFiles: [{ relPath: collisionContractRel, raw: collisionContractSource }],
      domainRel: auditRel,
      domainTestDir: auditTestDirRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      repoRoot: tmpRoot
    });
    assert.equal(collisionCrudCheck.ok, false);
    assert.deepEqual(collisionCrudCheck.currentDomainContractFiles, []);
    assert.deepEqual(collisionCrudCheck.otherDomainContractFiles, [collisionContractRel]);

    const collisionTopologyCheck = analyzeLogDualModeTestCoverage({
      testFiles: [{ relPath: collisionContractRel, raw: collisionContractSource }],
      domainRel: auditRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      domainTestDir: auditTestDirRel,
      repoRoot: tmpRoot
    });
    assert.equal(collisionTopologyCheck.ok, false);
    assert.deepEqual(collisionTopologyCheck.otherDomainValidSuiteFiles, [collisionContractRel]);

    // 2. Static negative: partial table mismatch & wrong domain repo token inside current domain
    const mismatchedTableStatic = analyzeLogDualModeTestCoverage({
      testFiles: [
        {
          relPath: auditDedicatedTopologyRel,
          raw: `
            import { describe, it } from 'vitest';
            import { injectRepo } from '@fastgpt/dal/db/container';
            import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
            registerLogTopologyContractSuite({
              describeFn: describe,
              itFn: it,
              logCollections: [auditLogCollection],
              logTables: [auditLogSqlTable],
              mongoCollectionName: 'audit_logs',
              sqlTableName: 'billing_logs',
              writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
              readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
            });
          `
        }
      ],
      domainRel: auditRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      domainTestDir: auditTestDirRel,
      repoRoot: tmpRoot
    });
    assert.equal(mismatchedTableStatic.ok, false);
    assert.match(
      mismatchedTableStatic.details,
      /sqlTableName "billing_logs" does not match current domain SQL table\(s\)/
    );

    const wrongRepoTokenStatic = analyzeLogDualModeTestCoverage({
      testFiles: [
        {
          relPath: auditDedicatedTopologyRel,
          raw: `
            import { describe, it } from 'vitest';
            import { injectRepo } from '@fastgpt/dal/db/container';
            import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';
            registerLogTopologyContractSuite({
              describeFn: describe,
              itFn: it,
              logCollections: [auditLogCollection],
              logTables: [auditLogSqlTable],
              mongoCollectionName: 'audit_logs',
              sqlTableName: 'audit_logs',
              writeLogRecord: async () => injectRepo(BillingLogRepoToken).create({}),
              readLogRecord: async ({ id }) => injectRepo(BillingLogRepoToken).findById({ id })
            });
          `
        }
      ],
      domainRel: auditRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      domainTestDir: auditTestDirRel,
      repoRoot: tmpRoot
    });
    assert.equal(wrongRepoTokenStatic.ok, false);
    assert.match(wrongRepoTokenStatic.details, /must exercise current domain repository/);

    // 3. Static positive: BOTH auditLog AND billingLog use imported `.name` descriptors (alone AND combined via --test)
    fs.writeFileSync(path.join(tmpRoot, auditDedicatedTopologyRel), auditDedicatedTopologySource);
    const validMixedStatic = analyzeLogDualModeTestCoverage({
      testFiles: [
        { relPath: auditCrudContractRel, raw: auditCrudOnlySource },
        { relPath: auditDedicatedTopologyRel, raw: auditDedicatedTopologySource },
        { relPath: billingDedicatedTopologyRel, raw: billingDedicatedTopologySource }
      ],
      domainRel: auditRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken', 'MongoAuditLogRepo', 'SqlAuditLogRepo']),
      domainMongoCollections: new Set(auditMongoInfo.logCollectionNames),
      domainSqlTables: new Set(auditSqlInfo.tables.map((t) => t.name)),
      domainCollectionExportNames: auditMongoInfo.collectionExportNames,
      domainTableExportNames: auditSqlInfo.tableExportNames,
      domainTestDir: auditTestDirRel,
      repoRoot: tmpRoot
    });
    assert.equal(validMixedStatic.ok, true, validMixedStatic.details);
    assert.deepEqual(validMixedStatic.validSuiteEntries, [
      {
        relPath: auditDedicatedTopologyRel,
        mongoCollectionName: 'audit_logs',
        sqlTableName: 'audit_logs'
      }
    ]);
    assert.deepEqual(validMixedStatic.otherDomainValidSuiteFiles, [billingDedicatedTopologyRel]);

    // Verify billingLog independently (with both `.name` descriptors) -> PASSES
    const cliBillingSelfRes = runVerify(
      ['--domain', billingRel, '--no-test', '--test', billingDedicatedTopologyRel],
      { cwd: tmpRoot }
    );
    assert.equal(cliBillingSelfRes.status, 0, cliBillingSelfRes.stderr);

    // Verify auditLog together with BOTH billing dedicated topology AND billing full CRUD+topology (using `.name` descriptors) -> PASSES
    const cliValidWithBillingRegression = runVerify(
      [
        '--domain',
        auditRel,
        '--no-test',
        '--test',
        auditDedicatedTopologyRel,
        '--test',
        billingDedicatedTopologyRel,
        '--test',
        billingContractRel
      ],
      { cwd: tmpRoot }
    );
    assert.equal(
      cliValidWithBillingRegression.status,
      0,
      cliValidWithBillingRegression.stderr
    );

    // 3b. Missing current-domain CRUD contract CANNOT be satisfied by another domain's CRUD contract via --test
    fs.rmSync(path.join(tmpRoot, auditCrudContractRel), { force: true });
    fs.writeFileSync(path.join(tmpRoot, billingContractRel), billingCrudOnlySource);
    const cliMissingAuditCrudWithBillingCrud = runVerify(
      [
        '--domain',
        auditRel,
        '--no-test',
        '--test',
        auditDedicatedTopologyRel,
        '--test',
        billingContractRel
      ],
      { cwd: tmpRoot }
    );
    assert.equal(cliMissingAuditCrudWithBillingCrud.status, 1);
    assert.match(
      cliMissingAuditCrudWithBillingCrud.stderr,
      /must invoke registerDualDialectContractSuite.*for the current domain.*other-domain CRUD contract\(s\) cannot substitute/
    );

    // Non-log main domain missing its own CRUD contract also rejects billingLog's CRUD contract
    fs.writeFileSync(
      path.join(tmpRoot, mainOrderDummyTopoRel),
      `export const helper = true;\n`
    );
    const cliMainDomainMissingCrud = runVerify(
      [
        '--domain',
        mainOrderRel,
        '--no-test',
        '--test',
        mainOrderDummyTopoRel,
        '--test',
        billingContractRel
      ],
      { cwd: tmpRoot }
    );
    assert.equal(cliMainDomainMissingCrud.status, 1);
    assert.match(
      cliMainDomainMissingCrud.stderr,
      /other-domain CRUD contract\(s\) cannot substitute/
    );
    fs.writeFileSync(path.join(tmpRoot, auditCrudContractRel), auditCrudOnlySource);
    fs.writeFileSync(path.join(tmpRoot, billingContractRel), billingFullSource);

    // 3c. Same-file mixed suite cases (distinguishing audit topology + billing CRUD vs audit CRUD using billing fixture)
    const sameFileAuditTopoBillingCrudSource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import {
        createContractBackends,
        registerLogTopologyContractSuite,
        registerMultiDialectContractSuite
      } from '@fastgpt/dal/db/testing';
      import { auditLogCollection } from '../../../../db/repos/auditLogProbe/mongo/schema';
      import { auditLogSqlTable } from '../../../../db/repos/auditLogProbe/sql/table';
      import { AuditLogRepoToken } from '@fastgpt/dal/db/repos/auditLogProbe/repo';
      import { billingLogCollection } from '../../../../db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '../../../../db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';

      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [auditLogCollection],
        logTables: [auditLogSqlTable],
        mongoCollectionName: auditLogCollection.name,
        sqlTableName: auditLogSqlTable.name,
        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
      });

      const billingBackends = createContractBackends({
        collections: [],
        logCollections: [billingLogCollection],
        tables: [],
        logTables: [billingLogSqlTable],
        logMode: 'separate'
      });
      registerMultiDialectContractSuite({
        backends: billingBackends,
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          const billingRepo = injectRepo(BillingLogRepoToken);
          it('only tests billing CRUD', async () => {
            expect(await billingRepo.create({})).toBeDefined();
          });
        }
      });
    `;

    // Negative 1: same file has audit topology + billing CRUD (must NOT satisfy audit CRUD gate!)
    const sameFileMixedNegStatic = analyzeMultiDialectContractCoverage({
      testFiles: [{ relPath: auditCrudContractRel, raw: sameFileAuditTopoBillingCrudSource }],
      domainRel: auditRel,
      domainTestDir: auditTestDirRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      repoRoot: tmpRoot
    });
    assert.equal(sameFileMixedNegStatic.ok, false);
    assert.deepEqual(sameFileMixedNegStatic.currentDomainContractFiles, []);
    assert.deepEqual(sameFileMixedNegStatic.otherDomainContractFiles, [auditCrudContractRel]);

    fs.writeFileSync(path.join(tmpRoot, auditCrudContractRel), sameFileAuditTopoBillingCrudSource);
    const cliSameFileAuditTopoBillingCrud = runVerify(
      ['--domain', auditRel, '--no-test'],
      { cwd: tmpRoot }
    );
    assert.equal(cliSameFileAuditTopoBillingCrud.status, 1);
    assert.match(
      cliSameFileAuditTopoBillingCrud.stderr,
      /other-domain CRUD contract\(s\) cannot substitute/
    );

    // Negative 2: single CRUD suite has shared backends listing BOTH audit & billing, yet registerTests only tests billing
    const sameFileSharedBackendsBillingOnlySource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import {
        createContractBackends,
        registerLogTopologyContractSuite,
        registerMultiDialectContractSuite
      } from '@fastgpt/dal/db/testing';
      import { auditLogCollection } from '../../../../db/repos/auditLogProbe/mongo/schema';
      import { auditLogSqlTable } from '../../../../db/repos/auditLogProbe/sql/table';
      import { AuditLogRepoToken } from '@fastgpt/dal/db/repos/auditLogProbe/repo';
      import { billingLogCollection } from '../../../../db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '../../../../db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';

      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [auditLogCollection],
        logTables: [auditLogSqlTable],
        mongoCollectionName: auditLogCollection.name,
        sqlTableName: auditLogSqlTable.name,
        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
      });

      const auditRepo = injectRepo(AuditLogRepoToken);
      const billingRepo = injectRepo(BillingLogRepoToken);
      const sharedBackends = createContractBackends({
        collections: [],
        logCollections: [auditLogCollection, billingLogCollection],
        tables: [],
        logTables: [auditLogSqlTable, billingLogSqlTable],
        logMode: 'separate'
      });
      registerMultiDialectContractSuite({
        backends: sharedBackends,
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          it('only exercises billingRepo despite outer auditRepo and shared backends', async () => {
            expect(await billingRepo.create({})).toBeDefined();
          });
        }
      });
    `;
    const sameFileSharedBackendsNeg = analyzeMultiDialectContractCoverage({
      testFiles: [
        { relPath: auditCrudContractRel, raw: sameFileSharedBackendsBillingOnlySource }
      ],
      domainRel: auditRel,
      domainTestDir: auditTestDirRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      repoRoot: tmpRoot
    });
    assert.equal(sameFileSharedBackendsNeg.ok, false);

    // Positive 1: same file has audit topology + audit CRUD that uses billingLog as prerequisite fixture via outer `const auditRepo`
    const sameFileAuditCrudWithBillingFixtureSource = `
      import { afterAll, beforeAll, describe, expect, it } from 'vitest';
      import { injectRepo } from '@fastgpt/dal/db/container';
      import {
        createContractBackends,
        registerLogTopologyContractSuite,
        registerMultiDialectContractSuite
      } from '@fastgpt/dal/db/testing';
      import { auditLogCollection } from '../../../../db/repos/auditLogProbe/mongo/schema';
      import { auditLogSqlTable } from '../../../../db/repos/auditLogProbe/sql/table';
      import { AuditLogRepoToken } from '@fastgpt/dal/db/repos/auditLogProbe/repo';
      import { billingLogCollection } from '../../../../db/repos/billingLogProbe/mongo/schema';
      import { billingLogSqlTable } from '../../../../db/repos/billingLogProbe/sql/table';
      import { BillingLogRepoToken } from '@fastgpt/dal/db/repos/billingLogProbe/repo';

      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [auditLogCollection],
        logTables: [auditLogSqlTable],
        mongoCollectionName: auditLogCollection.name,
        sqlTableName: auditLogSqlTable.name,
        writeLogRecord: async () => injectRepo(AuditLogRepoToken).create({}),
        readLogRecord: async ({ id }) => injectRepo(AuditLogRepoToken).findById({ id })
      });

      const auditRepo = injectRepo(AuditLogRepoToken);
      const billingFixtureRepo = injectRepo(BillingLogRepoToken);
      const sharedBackends = createContractBackends({
        collections: [],
        logCollections: [auditLogCollection, billingLogCollection],
        tables: [],
        logTables: [auditLogSqlTable, billingLogSqlTable],
        logMode: 'separate'
      });
      registerMultiDialectContractSuite({
        backends: sharedBackends,
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          it('seeds billing fixture and verifies audit CRUD', async () => {
            await billingFixtureRepo.create({});
            expect(await auditRepo.create({})).toBeDefined();
          });
        }
      });
    `;
    const sameFileFixturePos = analyzeMultiDialectContractCoverage({
      testFiles: [
        { relPath: auditCrudContractRel, raw: sameFileAuditCrudWithBillingFixtureSource }
      ],
      domainRel: auditRel,
      domainTestDir: auditTestDirRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      repoRoot: tmpRoot
    });
    assert.equal(sameFileFixturePos.ok, true);
    assert.deepEqual(sameFileFixturePos.currentDomainContractFiles, [auditCrudContractRel]);

    fs.writeFileSync(
      path.join(tmpRoot, auditCrudContractRel),
      sameFileAuditCrudWithBillingFixtureSource
    );
    const cliSameFileAuditCrudWithBillingFixture = runVerify(
      ['--domain', auditRel, '--no-test'],
      { cwd: tmpRoot }
    );
    assert.equal(
      cliSameFileAuditCrudWithBillingFixture.status,
      0,
      cliSameFileAuditCrudWithBillingFixture.stderr
    );

    // Positive 2: same file has audit topology + billing CRUD + separate audit CRUD call -> PASSES
    const sameFileTwoCrudSuitesSource = `
      ${sameFileAuditTopoBillingCrudSource}
      registerMultiDialectContractSuite({
        backends: createContractBackends({
          collections: [],
          logCollections: [auditLogCollection],
          tables: [],
          logTables: [auditLogSqlTable],
          logMode: 'separate'
        }),
        beforeAllFn: beforeAll,
        afterAllFn: afterAll,
        registerTests: () => {
          it('verifies audit CRUD explicitly', async () => {
            expect(await injectRepo(AuditLogRepoToken).create({})).toBeDefined();
          });
        }
      });
    `;
    const sameFileTwoCrudPos = analyzeMultiDialectContractCoverage({
      testFiles: [{ relPath: auditCrudContractRel, raw: sameFileTwoCrudSuitesSource }],
      domainRel: auditRel,
      domainTestDir: auditTestDirRel,
      domainRepoSymbols: new Set(['AuditLogRepoToken']),
      domainMongoCollections: new Set(['audit_logs']),
      domainSqlTables: new Set(['audit_logs']),
      repoRoot: tmpRoot
    });
    assert.equal(sameFileTwoCrudPos.ok, true);

    fs.writeFileSync(path.join(tmpRoot, auditCrudContractRel), auditCrudOnlySource);

    // 4. Execution plan unit checks: merges auto-discovered domain topology file & preserves non-unit routing
    const planWithOtherExplicit = buildDomainTestExecutionPlan({
      explicitTestTargets: [billingContractRel],
      isLogDomain: true,
      validLogSuiteFiles: [auditCrudContractRel]
    });
    assert.deepEqual(planWithOtherExplicit.executionTargets, [
      billingContractRel,
      auditCrudContractRel
    ]);
    assert.deepEqual(planWithOtherExplicit.dalTargets, [
      'test/db/repos/billingLogProbe/repo.contract.test.ts',
      'test/db/repos/auditLogProbe/repo.contract.test.ts'
    ]);

    const serviceTopologyRel = 'packages/service/test/core/audit/log.unit.test.ts';
    const planServiceLogTopology = buildDomainTestExecutionPlan({
      explicitTestTargets: [billingContractRel, serviceTopologyRel],
      isLogDomain: true,
      validLogSuiteFiles: [serviceTopologyRel]
    });
    assert.deepEqual(planServiceLogTopology.serviceUnitTargets, []);
    assert.deepEqual(planServiceLogTopology.rootTargets, [serviceTopologyRel]);

    // 5. Runtime JSON report unit checks: rejects other-domain-only green reports, file mismatch, or target mismatch
    const billingCases = buildRequiredLogTopologyCases({
      mongoCollectionName: 'billing_logs',
      sqlTableName: 'billing_logs'
    });
    const auditCases = buildRequiredLogTopologyCases({
      mongoCollectionName: 'audit_logs',
      sqlTableName: 'audit_logs'
    });
    const expectedAuditSuites = [
      {
        relPath: auditDedicatedTopologyRel,
        mongoCollectionName: 'audit_logs',
        sqlTableName: 'audit_logs'
      }
    ];

    const otherDomainOnlyRuntime = verifyExecutedLogTopologyReports({
      repoRoot: tmpRoot,
      expectedSuites: expectedAuditSuites,
      reports: [
        {
          testResults: [
            {
              name: path.join(tmpRoot, billingDedicatedTopologyRel),
              assertionResults: billingCases.map((c) => ({
                ancestorTitles: ['BillingLog', c.suiteTitle],
                title: c.caseTitle,
                status: 'passed'
              }))
            }
          ]
        }
      ]
    });
    assert.equal(otherDomainOnlyRuntime.ok, false);
    assert.equal(otherDomainOnlyRuntime.missingOrNotPassed.length, 4);
    assert.ok(otherDomainOnlyRuntime.missingOrNotPassed.every((msg) => msg.startsWith('missing (not executed):')));

    const wrongFileEmittingAuditTitle = verifyExecutedLogTopologyReports({
      repoRoot: tmpRoot,
      expectedSuites: expectedAuditSuites,
      reports: [
        {
          testResults: [
            {
              name: path.join(tmpRoot, billingDedicatedTopologyRel),
              assertionResults: auditCases.map((c) => ({
                ancestorTitles: ['Spoofed', c.suiteTitle],
                title: c.caseTitle,
                status: 'passed'
              }))
            }
          ]
        }
      ]
    });
    assert.equal(wrongFileEmittingAuditTitle.ok, false);
    assert.equal(wrongFileEmittingAuditTitle.missingOrNotPassed.length, 4);

    const wrongTargetInCurrentFile = verifyExecutedLogTopologyReports({
      repoRoot: tmpRoot,
      expectedSuites: expectedAuditSuites,
      reports: [
        {
          testResults: [
            {
              name: path.join(tmpRoot, auditDedicatedTopologyRel),
              assertionResults: billingCases.map((c) => ({
                ancestorTitles: ['WrongTarget', c.suiteTitle],
                title: c.caseTitle,
                status: 'passed'
              }))
            }
          ]
        }
      ]
    });
    assert.equal(wrongTargetInCurrentFile.ok, false);
    assert.equal(wrongTargetInCurrentFile.missingOrNotPassed.length, 4);

    assert.equal(
      verifyExecutedLogTopologyReports({
        repoRoot: tmpRoot,
        expectedSuites: [],
        reports: []
      }).ok,
      false
    );

    const bothPresentRuntime = verifyExecutedLogTopologyReports({
      repoRoot: tmpRoot,
      expectedSuites: expectedAuditSuites,
      reports: [
        {
          testResults: [
            {
              name: path.join(tmpRoot, billingDedicatedTopologyRel),
              assertionResults: billingCases.map((c) => ({
                ancestorTitles: ['BillingLog', c.suiteTitle],
                title: c.caseTitle,
                status: 'passed'
              }))
            },
            {
              name: path.join(tmpRoot, auditDedicatedTopologyRel),
              assertionResults: auditCases.map((c) => ({
                ancestorTitles: ['AuditLog', c.suiteTitle],
                title: c.caseTitle,
                status: 'passed'
              }))
            }
          ]
        }
      ]
    });
    assert.equal(bothPresentRuntime.ok, true);
    assert.equal(bothPresentRuntime.passedCases.length, 4);

    // 6. Real registerLogTopologyContractSuite Vitest JSON reporter end-to-end verification (real MongoDB + PGlite)
    const makeRealRegisterVitestFile = (targetName) => `
      import { Schema } from 'mongoose';
      import { describe, it } from 'vitest';
      import { z } from 'zod';
      import { createEntityId } from '@fastgpt/global/common/string/entityId';
      import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
      import { MongoRepositoryBase } from '@fastgpt/dal/db/mongo/base';
      import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';
      import { SqlRepositoryBase } from '@fastgpt/dal/db/sql/base';
      import { registerLogTopologyContractSuite } from '@fastgpt/dal/db/testing';

      const probeReadSchema = z.object({
        _id: z.string(),
        teamId: z.string()
      });
      const probeCollection = defineMongoCollection<{ _id: string; teamId: string }>({
        name: '${targetName}',
        datasource: 'log',
        schema: new Schema({ _id: String, teamId: String }, { autoIndex: false })
      });
      const probeSqlTable = defineSqlTable({
        name: '${targetName}',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          team_id: { kind: 'entityId' }
        }
      });

      class ProbeMongoLogRepo extends MongoRepositoryBase<
        { _id: string; teamId: string },
        typeof probeReadSchema
      > {
        constructor() {
          super({ collection: probeCollection, readSchema: probeReadSchema });
        }
        async writeEntry() {
          const id = createEntityId();
          await this.model.create({ _id: id, teamId: createEntityId() });
          return { id };
        }
        async readEntry(id: string) {
          return this.model.findOne({ _id: id }).lean();
        }
      }

      class ProbeSqlLogRepo extends SqlRepositoryBase<
        any,
        '${targetName}',
        typeof probeReadSchema
      > {
        protected readonly tableName = '${targetName}' as const;
        protected readonly readSchema = probeReadSchema;
        protected override readonly datasource = 'log' as const;
        async writeEntry() {
          const id = createEntityId();
          await this.db()
            .insertInto(this.tableName)
            .values({ _id: id, team_id: createEntityId() })
            .execute();
          return { id };
        }
        async readEntry(id: string) {
          const row = await this.readDb()
            .selectFrom(this.tableName)
            .selectAll()
            .where('_id', '=', id)
            .executeTakeFirst();
          return row ?? null;
        }
      }

      registerLogTopologyContractSuite({
        describeFn: describe,
        itFn: it,
        logCollections: [probeCollection],
        logTables: [probeSqlTable],
        mongoCollectionName: probeCollection.name,
        sqlTableName: probeSqlTable.name,
        writeLogRecord: async ({ dialect }) =>
          dialect === 'mongo'
            ? new ProbeMongoLogRepo().writeEntry()
            : new ProbeSqlLogRepo().writeEntry(),
        readLogRecord: async ({ dialect, id }) =>
          dialect === 'mongo'
            ? new ProbeMongoLogRepo().readEntry(id)
            : new ProbeSqlLogRepo().readEntry(id)
      });
    `;
    fs.writeFileSync(vitestProbeAbsBilling, makeRealRegisterVitestFile('billing_logs'));
    fs.writeFileSync(vitestProbeAbsAudit, makeRealRegisterVitestFile('audit_logs'));

    const billingVitestTarget = vitestProbeRelBilling.slice('packages/dal/'.length);
    const auditVitestTarget = vitestProbeRelAudit.slice('packages/dal/'.length);
    const runRealVitestProbesCmd = [
      `pnpm --filter @fastgpt/dal exec vitest run -c vitest.config.ts --coverage.enabled=false ${JSON.stringify(billingVitestTarget)} --reporter=json --outputFile=${JSON.stringify(billingReportJsonAbs)}`,
      `pnpm --filter @fastgpt/dal exec vitest run -c vitest.config.ts --coverage.enabled=false ${JSON.stringify(billingVitestTarget)} ${JSON.stringify(auditVitestTarget)} --reporter=json --outputFile=${JSON.stringify(bothReportJsonAbs)}`
    ].join(' && ');

    execFileSync(
      'node',
      [path.join(repoRoot, 'scripts/test/withMongo.mjs'), 'sh', '-c', runRealVitestProbesCmd],
      { cwd: repoRoot, stdio: 'pipe' }
    );

    const realBillingOnlyReport = JSON.parse(fs.readFileSync(billingReportJsonAbs, 'utf8'));
    const realAuditExpected = [
      {
        relPath: vitestProbeRelAudit,
        mongoCollectionName: 'audit_logs',
        sqlTableName: 'audit_logs'
      }
    ];
    const realBillingOnlyVerdict = verifyExecutedLogTopologyReports({
      repoRoot,
      expectedSuites: realAuditExpected,
      reports: [realBillingOnlyReport]
    });
    assert.equal(realBillingOnlyVerdict.ok, false);
    assert.equal(realBillingOnlyVerdict.missingOrNotPassed.length, 4);

    const realBothReport = JSON.parse(fs.readFileSync(bothReportJsonAbs, 'utf8'));
    const realBothVerdict = verifyExecutedLogTopologyReports({
      repoRoot,
      expectedSuites: realAuditExpected,
      reports: [realBothReport]
    });
    assert.equal(realBothVerdict.ok, true, JSON.stringify(realBothVerdict));
    assert.equal(realBothVerdict.passedCases.length, 4);
  } finally {
    fs.rmSync(vitestProbeAbsBilling, { force: true });
    fs.rmSync(vitestProbeAbsAudit, { force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
