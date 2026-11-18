import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverMongoSchemas, extractDefineIndexes } from './common.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../../..');
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

const runNodeScript = (scriptPath, args) => {
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      cwd: repoRoot,
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

const runVerify = (args) => runNodeScript(verifyScript, args);

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

test('supports multi-file --legacy-schema merging into one mongo/schema.ts', () => {
  withTempDomain(
    {
      legacySchema: `defineIndex(EvalSchema, { key: { teamId: 1 } });`,
      newMongoSchema: `
        defineIndex(EvalSchema, { key: { teamId: 1 } });
        defineIndex(EvalItemSchema, { key: { evalId: 1, index: 1 }, options: { unique: true } });
      `
    },
    ({ tmpBase, domainRel, legacyRel }) => {
      const secondLegacy = path.join(tmpBase, 'evalItemSchema.ts');
      fs.writeFileSync(
        secondLegacy,
        `defineIndex(EvalItemSchema, { key: { evalId: 1, index: 1 }, options: { unique: true } });\n`
      );
      const secondRel = path.relative(repoRoot, secondLegacy);

      const passRes = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel, secondRel]);
      assert.equal(passRes.status, 0, passRes.stderr);

      const thirdLegacy = path.join(tmpBase, 'missingSchema.ts');
      fs.writeFileSync(thirdLegacy, `defineIndex(Extra, { key: { missingKey: 1 } });\n`);
      const failRes = runVerify([
        '--dir',
        domainRel,
        '--legacy-schema',
        legacyRel,
        path.relative(repoRoot, thirdLegacy)
      ]);
      assert.equal(failRes.status, 1);
      assert.match(failRes.stderr, /missingKey_1/);
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
        export const MongoBad = getMongoModel('bad', S);
      `
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /calls \.index\(\) directly/);
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
        newMongoSchema: `defineIndex(S, { key: { teamId: 1 } });`,
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

test('scaffold-repo.mjs preserves existing service.ts, generates normalized SQL/Mongo templates, and passes verify-domain.mjs', () => {
  const tmpDomainRel = 'packages/service/.scaffold-verify-probe';
  const tmpDomainAbs = path.join(repoRoot, tmpDomainRel);
  const tmpTestAbs = path.join(repoRoot, 'packages/service/test/.scaffold-verify-probe');

  try {
    fs.mkdirSync(tmpDomainAbs, { recursive: true });
    const existingServiceText = 'export const keepMyExistingBusinessLogic = true;\n';
    fs.writeFileSync(path.join(tmpDomainAbs, 'service.ts'), existingServiceText);

    const scaffoldRes = runNodeScript(scaffoldScript, [
      '--dir',
      tmpDomainRel,
      '--entity',
      'ProbeWidget',
      '--table',
      'probe_widgets',
      '--datasource',
      'log',
      '--soft-delete'
    ]);
    assert.equal(scaffoldRes.status, 0, scaffoldRes.stderr);
    assert.match(scaffoldRes.stdout, /Skipped existing: packages\/service\/\.scaffold-verify-probe\/service\.ts/);
    assert.equal(fs.readFileSync(path.join(tmpDomainAbs, 'service.ts'), 'utf8'), existingServiceText);

    const sqlRepo = fs.readFileSync(path.join(tmpDomainAbs, 'sql/repo.ts'), 'utf8');
    assert.match(sqlRepo, /this\.readDb\(tx\)/);
    assert.match(sqlRepo, /this\.normalizeId\(id\)/);
    assert.match(sqlRepo, /isValidEntityId\(id\)/);

    const noopRepo = fs.readFileSync(path.join(tmpDomainAbs, 'noop/repo.ts'), 'utf8');
    assert.match(noopRepo, /ProbeWidgetDomainReadSchema\.parse\(/);

    const contractTest = fs.readFileSync(
      path.join(tmpTestAbs, 'repo.contract.test.ts'),
      'utf8'
    );
    assert.doesNotMatch(contractTest, /execute\(undefined\)/);
    assert.match(contractTest, /createCollection\(\)/);

    const verifyRes = runVerify(['--dir', tmpDomainRel]);
    assert.equal(verifyRes.status, 0, verifyRes.stderr);
  } finally {
    fs.rmSync(tmpDomainAbs, { recursive: true, force: true });
    fs.rmSync(tmpTestAbs, { recursive: true, force: true });
  }
});

test('fails loudly when --git-legacy cannot be read and passes with merge-base:<path> against real appRegistration', () => {
  const missingRes = runVerify([
    '--dir',
    'packages/service/support/appRegistration',
    '--git-legacy',
    'packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(missingRes.status, 1);
  assert.match(missingRes.stderr, /Failed to read --git-legacy/);

  const mergeBaseRes = runVerify([
    '--dir',
    'packages/service/support/appRegistration',
    '--git-legacy',
    'merge-base:packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(mergeBaseRes.status, 0, mergeBaseRes.stderr);
  assert.match(mergeBaseRes.stdout, /Domain verification PASSED/);
});
