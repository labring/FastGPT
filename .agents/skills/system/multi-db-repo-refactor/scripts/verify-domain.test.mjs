import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSchemaIndexes,
  analyzeSqlTableDefinitions,
  discoverMongoSchemas,
  extractDefineIndexes,
  readGitLegacyFile
} from './common.mjs';

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
    assert.match(contractTest, /createMongoTestHarness\(/);
    assert.match(contractTest, /compileSqlTableDDL\(probeWidgetSqlTable, 'oceanbase'\)/);
    assert.match(contractTest, /logMode:\s*'shared'/);

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
        assert.match(res.stderr, /must exercise shared\/separate log topology routing with real assertions/);

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
        assert.match(importOnlyRes.stderr, /must exercise shared\/separate log topology routing with real assertions/);

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
          /must exercise shared\/separate log topology routing with real assertions/
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
