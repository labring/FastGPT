import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { inspectMongoIndexes, syncMongoCollectionIndexes } from '@fastgpt/dal/db/mongo/indexSync';
import {
  APP_REGISTRATION_SQL_TABLE_V1,
  coreMongoCollections,
  coreSqlMigrations,
  coreSqlTables
} from '@fastgpt/dal/db/repos/registry';
import {
  compileSqlTableDDL,
  defineSqlTable,
  validateSqlTableRegistry
} from '@fastgpt/dal/db/sql/ddl';
import { applySqlTableDDL, inspectSqlSchema } from '@fastgpt/dal/db/sql/migrations/helpers';
import {
  runSqlMigrations,
  SQL_MIGRATIONS_LEDGER_TABLE
} from '@fastgpt/dal/db/sql/migrations/runner';
import {
  createContractBackends,
  createMongoTestHarness,
  createMysqlSqlTestHarness,
  createPGliteSqlTestHarness,
  createPostgresSqlTestHarness,
  parseRequiredSqlDialects
} from '@fastgpt/dal/db/testing';
import type { SqlDialect } from '@fastgpt/dal/db/types';

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

const assertZeroSqlDrift = (report: Awaited<ReturnType<typeof inspectSqlSchema>>): void => {
  expect(report.missingTables).toEqual([]);
  expect(report.missingColumns).toEqual([]);
  expect(report.columnMismatches).toEqual([]);
  expect(report.missingIndexes).toEqual([]);
  expect(report.indexMismatches).toEqual([]);
  expect(report.invalidIndexes).toEqual([]);
  expect(report.extraManagedIndexes).toEqual([]);
};

describe('CI schema & index anti-drift guardrails', () => {
  it('validates SQL table registry globally and replays coreSqlMigrations 0001 -> latest with zero column/index drift', async () => {
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
      assertZeroSqlDrift(report);
    } finally {
      await pgliteHarness.close();
    }

    // 2. Replay on external MySQL / OceanBase / PG containers whenever CI env vars are provided
    //    If FASTGPT_TEST_REQUIRED_SQL_DIALECTS is set, every listed dialect MUST have a URI and execute!
    const requiredSqlDialects = parseRequiredSqlDialects(process.env);
    const externalCandidates: Array<{ dialect: SqlDialect; envKey: string; uri?: string }> = [
      {
        dialect: 'mysql',
        envKey: 'FASTGPT_TEST_MYSQL_URI',
        uri: process.env.FASTGPT_TEST_MYSQL_URI
      },
      {
        dialect: 'oceanbase',
        envKey: 'FASTGPT_TEST_OCEANBASE_URI',
        uri: process.env.FASTGPT_TEST_OCEANBASE_URI
      },
      {
        dialect: 'postgres',
        envKey: 'FASTGPT_TEST_PG_URI',
        uri: process.env.FASTGPT_TEST_PG_URI
      }
    ];

    for (const required of requiredSqlDialects) {
      const entry = externalCandidates.find((c) => c.dialect === required);
      expect(
        entry?.uri?.trim(),
        `FASTGPT_TEST_REQUIRED_SQL_DIALECTS requires "${required}", so ${entry?.envKey} must be non-empty`
      ).toBeTruthy();
    }

    const externalSqlTargets = externalCandidates.filter(
      (t): t is { dialect: SqlDialect; envKey: string; uri: string } => Boolean(t.uri?.trim())
    );
    const executedExternalDialects = new Set<SqlDialect>();

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
        assertZeroSqlDrift(report);
        executedExternalDialects.add(target.dialect);
      } finally {
        await harness.close();
      }
    }

    for (const required of requiredSqlDialects) {
      expect(
        executedExternalDialects.has(required),
        `Required SQL dialect "${required}" did not execute schema drift replay`
      ).toBe(true);
    }
  });

  it('verifies forward upgrade from frozen v1 baseline to latest and catches missing columns on unmigrated schema changes', async () => {
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      // 1. Seed a legacy production DB frozen at v1 (0001_init_app_registrations already applied)
      await applySqlTableDDL({
        db: harness.db,
        dialect: 'postgres',
        table: APP_REGISTRATION_SQL_TABLE_V1
      });
      await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: [
          {
            id: '0001_init_app_registrations',
            name: 'Frozen v1 baseline',
            scope: 'core',
            datasource: 'main',
            up: async () => undefined
          }
        ]
      });

      // Verify ledger marks 0001 as applied before running the live migration chain
      const preUpgradeLedger = await harness.db
        .selectFrom(SQL_MIGRATIONS_LEDGER_TABLE)
        .select(['scope', 'datasource', 'id'])
        .execute();
      expect(preUpgradeLedger).toEqual([
        { scope: 'core', datasource: 'main', id: '0001_init_app_registrations' }
      ]);

      // 2. Forward-upgrade: replay coreSqlMigrations on top of existing v1 DB (0001 is skipped, 0002+ run)
      const upgradeRes = await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: coreSqlMigrations
      });
      expect(upgradeRes.applied).not.toContain('0001_init_app_registrations');
      expect(upgradeRes.alreadyAppliedCount).toBeGreaterThanOrEqual(1);

      const postUpgradeReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: coreSqlTables
      });
      assertZeroSqlDrift(postUpgradeReport);

      // 3. Negative drift proof: declaring a new column or altering an existing column without a 0002 migration
      //    MUST fail inspectSqlSchema on an already-migrated v1 database!
      const unmigratedSchemaEvolution = defineSqlTable({
        name: 'app_registrations',
        columns: {
          ...APP_REGISTRATION_SQL_TABLE_V1.columns,
          app_id: { kind: 'entityId', nullable: false }, // changed nullability without migration
          status: { kind: 'varchar', length: 32, defaultValue: 'active' } // added column without 0002 migration
        },
        indexes: APP_REGISTRATION_SQL_TABLE_V1.indexes
      });

      const negativeDriftReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [unmigratedSchemaEvolution]
      });
      expect(negativeDriftReport.missingColumns).toEqual([
        { table: 'app_registrations', column: 'status' }
      ]);
      expect(negativeDriftReport.columnMismatches).toEqual([
        expect.objectContaining({
          table: 'app_registrations',
          column: 'app_id',
          reason: expect.stringContaining('nullability expected NOT NULL')
        })
      ]);
    } finally {
      await harness.close();
    }
  });

  it('syncs coreMongoCollections additively with zero inspect drift', async () => {
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
  });

  it('enforces zero deprecated: true index tombstones in core schemas (and Pro schemas when present or required)', () => {
    // 1. Core roots are ALWAYS required to exist and contain >0 schema files
    const coreScanRoots = [
      path.join(REPO_ROOT, 'packages/dal/db/repos'),
      path.join(REPO_ROOT, 'packages/service')
    ];
    const offendingCoreFiles: string[] = [];
    for (const root of coreScanRoots) {
      expect(fs.existsSync(root), `Core schema root missing: ${root}`).toBe(true);
      const files = collectSchemaFiles(root);
      expect(files.length, `Expected >0 schema files under ${root}`).toBeGreaterThan(0);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (/\bdeprecated\s*:\s*true\b/.test(content)) {
          offendingCoreFiles.push(path.relative(REPO_ROOT, file));
        }
      }
    }
    expect(offendingCoreFiles).toEqual([]);

    // 2. Pro root: required loudly when FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 (Pro CI workflow);
    //    in public CI without Pro checkout, never falsely claim Pro was verified, and scan if present locally.
    const requireProGuard = process.env.FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD === '1';
    const proRoot = path.join(REPO_ROOT, 'pro/admin/src');
    const proRootExists = fs.existsSync(proRoot);

    if (requireProGuard) {
      expect(
        proRootExists,
        'FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires pro/admin/src to be checked out'
      ).toBe(true);
    }

    if (proRootExists) {
      const proFiles = collectSchemaFiles(proRoot);
      if (requireProGuard) {
        expect(
          proFiles.length,
          'FASTGPT_TEST_REQUIRE_PRO_SCHEMA_GUARD=1 requires >0 schema files under pro/admin/src'
        ).toBeGreaterThan(0);
      }
      const offendingProFiles: string[] = [];
      for (const file of proFiles) {
        const content = fs.readFileSync(file, 'utf8');
        if (/\bdeprecated\s*:\s*true\b/.test(content)) {
          offendingProFiles.push(path.relative(REPO_ROOT, file));
        }
      }
      expect(offendingProFiles).toEqual([]);
    }
  });

  it('assembles multi-backend contract matrix dynamically and enforces FASTGPT_TEST_REQUIRED_SQL_DIALECTS', () => {
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
        FASTGPT_TEST_PG_URI: 'postgres://postgres:pass@127.0.0.1:5432/postgres',
        FASTGPT_TEST_REQUIRED_SQL_DIALECTS: 'mysql,oceanbase,postgres'
      }
    });
    expect(fullCiBackends.map((b) => b.label)).toEqual([
      'MongoDB',
      'SQL (PGlite)',
      'SQL (MySQL 8)',
      'SQL (OceanBase)',
      'SQL (PostgreSQL)'
    ]);

    expect(() =>
      createContractBackends({
        collections: coreMongoCollections,
        tables: coreSqlTables,
        env: {
          FASTGPT_TEST_REQUIRED_SQL_DIALECTS: 'mysql'
        }
      })
    ).toThrow(DbConfigurationError);
  });
});
