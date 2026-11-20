import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectMongoIndexes, syncMongoCollectionIndexes } from '@fastgpt/dal/db/mongo/indexSync';
import {
  coreMongoCollections,
  coreSqlMigrations,
  coreSqlTables
} from '@fastgpt/dal/db/repos/registry';
import { compileSqlTableDDL, validateSqlTableRegistry } from '@fastgpt/dal/db/sql/ddl';
import { inspectSqlSchema } from '@fastgpt/dal/db/sql/migrations/helpers';
import { runSqlMigrations } from '@fastgpt/dal/db/sql/migrations/runner';
import {
  createContractBackends,
  createMongoTestHarness,
  createMysqlSqlTestHarness,
  createPGliteSqlTestHarness,
  createPostgresSqlTestHarness
} from '@fastgpt/dal/db/testing';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

const collectSchemaFiles = (rootDir: string): string[] => {
  const results: string[] = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'test' ||
        entry.name === 'dist' ||
        entry.name === '.git'
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        /(?:schema|Schema)[A-Za-z0-9_]*\.ts$|^ttl\.ts$/.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
};

describe('CI schema & index anti-drift guardrails', () => {
  it('validates SQL table registry globally and replays coreSqlMigrations 0001 -> latest with zero drift', async () => {
    expect(() => validateSqlTableRegistry(coreSqlTables)).not.toThrow();

    // Verify OceanBase/MySQL + PG DDL compiles cleanly for every registered table
    for (const table of coreSqlTables) {
      const obSql = compileSqlTableDDL(table, 'oceanbase').join('\n');
      expect(obSql).toContain('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;');
      const pgSql = compileSqlTableDDL(table, 'postgres').join('\n');
      expect(pgSql).toContain('CREATE TABLE IF NOT EXISTS');
    }

    // 1. Replay on PGlite (always runs locally & in CI)
    const pgliteHarness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      await runSqlMigrations({
        db: pgliteHarness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: coreSqlMigrations
      });
      const report = await inspectSqlSchema({
        db: pgliteHarness.db,
        dialect: 'postgres',
        tables: coreSqlTables
      });
      expect(report.missingTables).toEqual([]);
      expect(report.missingIndexes).toEqual([]);
      expect(report.invalidIndexes).toEqual([]);
      expect(report.extraManagedIndexes).toEqual([]);
    } finally {
      await pgliteHarness.close();
    }

    // 2. Replay on external MySQL / OceanBase / PG containers whenever CI env vars are provided
    const externalSqlTargets = [
      { dialect: 'mysql' as const, uri: process.env.FASTGPT_TEST_MYSQL_URI },
      { dialect: 'oceanbase' as const, uri: process.env.FASTGPT_TEST_OCEANBASE_URI },
      { dialect: 'postgres' as const, uri: process.env.FASTGPT_TEST_PG_URI }
    ].filter((t): t is { dialect: 'mysql' | 'oceanbase' | 'postgres'; uri: string } =>
      Boolean(t.uri?.trim())
    );

    for (const target of externalSqlTargets) {
      const harness =
        target.dialect === 'postgres'
          ? await createPostgresSqlTestHarness({ uri: target.uri.trim(), tables: [] })
          : await createMysqlSqlTestHarness({
              dialect: target.dialect,
              uri: target.uri.trim(),
              tables: []
            });
      try {
        await runSqlMigrations({
          db: harness.db,
          dialect: target.dialect,
          scope: 'core',
          migrations: coreSqlMigrations
        });
        const report = await inspectSqlSchema({
          db: harness.db,
          dialect: target.dialect,
          tables: coreSqlTables
        });
        expect(report.missingTables).toEqual([]);
        expect(report.missingIndexes).toEqual([]);
        expect(report.invalidIndexes).toEqual([]);
        expect(report.extraManagedIndexes).toEqual([]);
      } finally {
        await harness.close();
      }
    }
  });

  it('syncs coreMongoCollections additively with zero inspect drift and enforces zero deprecated: true tombstones repo-wide', async () => {
    const harness = await createMongoTestHarness({ collections: [] });
    try {
      const syncReport = await syncMongoCollectionIndexes({
        client: harness.client,
        collections: coreMongoCollections
      });
      expect(syncReport.errors).toEqual([]);

      const inspectReport = await inspectMongoIndexes({
        client: harness.client,
        collections: coreMongoCollections
      });
      expect(inspectReport.missingIndexes).toEqual([]);
      expect(inspectReport.optionMismatches).toEqual([]);
      expect(inspectReport.extraManagedIndexes).toEqual([]);
    } finally {
      await harness.close();
    }

    // Repo-wide regression lock: zero `deprecated: true` index tombstones in any Mongo schema file
    const scanRoots = [
      path.join(REPO_ROOT, 'packages/dal/db/repos'),
      path.join(REPO_ROOT, 'packages/service'),
      path.join(REPO_ROOT, 'pro/admin/src')
    ];
    const offendingFiles: string[] = [];
    for (const root of scanRoots) {
      for (const file of collectSchemaFiles(root)) {
        const content = fs.readFileSync(file, 'utf8');
        if (/\bdeprecated\s*:\s*true\b/.test(content)) {
          offendingFiles.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(offendingFiles).toEqual([]);
  });

  it('assembles multi-backend contract matrix dynamically from env vars', () => {
    const defaultBackends = createContractBackends({
      collections: coreMongoCollections,
      tables: coreSqlTables,
      env: {}
    });
    expect(defaultBackends.map((b) => b.label)).toEqual(['MongoDB', 'SQL (PGlite)']);
    expect(defaultBackends.map((b) => b.supportsMultiConnectionConcurrency)).toEqual([true, false]);

    const fullCiBackends = createContractBackends({
      collections: coreMongoCollections,
      tables: coreSqlTables,
      env: {
        FASTGPT_TEST_MYSQL_URI: 'mysql://root:pass@127.0.0.1:3306/mysql',
        FASTGPT_TEST_OCEANBASE_URI: 'mysql://root@127.0.0.1:2881/test',
        FASTGPT_TEST_PG_URI: 'postgres://postgres:pass@127.0.0.1:5432/postgres'
      }
    });
    expect(fullCiBackends.map((b) => b.label)).toEqual([
      'MongoDB',
      'SQL (PGlite)',
      'SQL (MySQL 8)',
      'SQL (OceanBase)',
      'SQL (PostgreSQL)'
    ]);
  });
});
