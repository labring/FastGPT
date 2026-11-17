import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDefineIndexes } from './common.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../../..');
const verifyScript = path.join(scriptDir, 'verify-domain.mjs');

const withTempDomain = ({ newMongoSchema, legacySchema }, fn) => {
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

    fn({ domainRel: path.relative(repoRoot, domainDir), legacyRel: path.relative(repoRoot, legacyPath) });
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
};

const runVerify = (args) => {
  try {
    const stdout = execFileSync('node', [verifyScript, ...args], {
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

test('extractDefineIndexes semantically parses keys, derived names, arithmetic TTL, partial filters, and collations', () => {
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
  `);

  assert.equal(indexes.length, 1);
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
});

test('fails when unique option is dropped on the same key', () => {
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
});

test('fails when TTL expireAfterSeconds is dropped or modified', () => {
  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { createTime: 1 }, options: { expireAfterSeconds: 24 * 60 * 60 } });`,
      newMongoSchema: `defineIndex(S, { key: { createTime: 1 }, options: { expireAfterSeconds: 3600 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /"expireAfterSeconds":86400/);
    }
  );

  withTempDomain(
    {
      legacySchema: `defineIndex(S, { key: { createTime: 1 }, options: { expireAfterSeconds: 60 * 60 } });`,
      newMongoSchema: `defineIndex(S, { key: { createTime: 1 } });`
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /"expireAfterSeconds":3600/);
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

test('passes when semantically equivalent expressions (arithmetic TTL, reordered filter keys, comments) match', () => {
  withTempDomain(
    {
      legacySchema: `
        // TTL and unique partial index
        defineIndex(S, {
          key: { createTime: 1 },
          options: { expireAfterSeconds: 24 * 60 * 60 }
        });
        defineIndex(S, {
          key: { teamId: 1, 'meta.tag': 1 },
          options: {
            unique: true,
            partialFilterExpression: { b: 2, a: { $exists: true } },
            background: true
          }
        });
      `,
      newMongoSchema: `
        defineIndex(S, {
          key: { createTime: 1 },
          options: { expireAfterSeconds: 86400, name: 'createTime_1' }
        });
        defineIndex(S, {
          key: { teamId: 1, "meta.tag": 1 },
          options: {
            partialFilterExpression: { a: { $exists: true }, b: 2 },
            unique: true
          }
        });
      `
    },
    ({ domainRel, legacyRel }) => {
      const res = runVerify(['--dir', domainRel, '--legacy-schema', legacyRel]);
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /Domain verification PASSED/);
    }
  );
});

test('fails loudly when --git-legacy cannot be read and passes against real historical commit baseline', () => {
  const missingRes = runVerify([
    '--dir',
    'packages/service/support/appRegistration',
    '--git-legacy',
    'packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(missingRes.status, 1);
  assert.match(missingRes.stderr, /Failed to read --git-legacy/);

  const validRes = runVerify([
    '--dir',
    'packages/service/support/appRegistration',
    '--git-legacy',
    '7de57ac2:packages/service/support/appRegistration/schema.ts'
  ]);
  assert.equal(validRes.status, 0, validRes.stderr);
  assert.match(validRes.stdout, /Domain verification PASSED/);
});
