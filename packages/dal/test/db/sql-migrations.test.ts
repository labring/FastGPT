import {
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  sql,
  type Driver
} from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { coreSqlMigrations, coreSqlTables } from '@fastgpt/dal/db/repos/registry';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';
import {
  dropSqlIndexIfExists,
  ensureSqlIndex,
  inspectSqlSchema
} from '@fastgpt/dal/db/sql/migrations/helpers';
import {
  runSqlMigrations,
  SQL_MIGRATIONS_LEDGER_TABLE
} from '@fastgpt/dal/db/sql/migrations/runner';
import type {
  SqlMigrationDefinition,
  SqlMigrationLock
} from '@fastgpt/dal/db/sql/migrations/types';
import { createPGliteSqlTestHarness } from '@fastgpt/dal/db/testing';

const createInMemoryMutexLock = (): { lock: SqlMigrationLock; acquisitions: number } => {
  let chain: Promise<void> = Promise.resolve();
  const state = { acquisitions: 0 };

  const lock: SqlMigrationLock = {
    withLock: async ({ fn }) => {
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      const prev = chain;
      chain = prev.then(() => next);
      await prev;
      state.acquisitions += 1;
      try {
        return await fn();
      } finally {
        release();
      }
    }
  };

  return {
    lock,
    get acquisitions() {
      return state.acquisitions;
    }
  };
};

describe('@fastgpt/dal/db/sql/migrations lightweight DDL runner & inspect', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('applies core migrations cleanly, passes anti-drift inspect, is idempotent, and protects customer DBA indexes', async () => {
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      // 1. Run coreSqlMigrations (0001_init_app_registrations)
      const firstRun = await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: coreSqlMigrations
      });
      expect(firstRun.applied).toEqual(['0001_init_app_registrations']);
      expect(firstRun.skippedFutureIds).toEqual([]);
      expect(firstRun.alreadyAppliedCount).toBe(0);

      // 2. Anti-drift inspect must report 0 missing tables/indexes & 0 extra managed indexes
      const cleanReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: coreSqlTables
      });
      expect(cleanReport.missingTables).toEqual([]);
      expect(cleanReport.missingIndexes).toEqual([]);
      expect(cleanReport.invalidIndexes).toEqual([]);
      expect(cleanReport.extraManagedIndexes).toEqual([]);
      expect(cleanReport.customerIndexes).toEqual([]);

      // 3. Re-running is a clean idempotent no-op
      const secondRun = await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: coreSqlMigrations
      });
      expect(secondRun.applied).toEqual([]);
      expect(secondRun.alreadyAppliedCount).toBe(1);

      // 4. Add a customer DBA index + an extra fg_* index; inspect classifies them accurately
      await sql
        .raw('CREATE INDEX "dba_custom_created_at" ON "app_registrations" ("created_at");')
        .execute(harness.db);
      await sql
        .raw('CREATE INDEX "fg_app_reg_old_legacy" ON "app_registrations" ("created_at");')
        .execute(harness.db);

      const driftReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: coreSqlTables
      });
      expect(driftReport.customerIndexes).toEqual([
        { table: 'app_registrations', indexName: 'dba_custom_created_at' }
      ]);
      expect(driftReport.extraManagedIndexes).toEqual([
        { table: 'app_registrations', indexName: 'fg_app_reg_old_legacy' }
      ]);

      // 5. Hard guard: dropSqlIndexIfExists REFUSES to drop customer DBA index without fg_ prefix
      await expect(
        dropSqlIndexIfExists({
          db: harness.db,
          dialect: 'postgres',
          table: 'app_registrations',
          indexName: 'dba_custom_created_at',
          concurrently: false
        })
      ).rejects.toThrow(DbConfigurationError);

      // 6. Managed fg_* index drops cleanly and is idempotent on repeat
      const dropped = await dropSqlIndexIfExists({
        db: harness.db,
        dialect: 'postgres',
        table: 'app_registrations',
        indexName: 'fg_app_reg_old_legacy',
        concurrently: false
      });
      expect(dropped.status).toBe('dropped');

      const droppedAgain = await dropSqlIndexIfExists({
        db: harness.db,
        dialect: 'postgres',
        table: 'app_registrations',
        indexName: 'fg_app_reg_old_legacy',
        concurrently: false
      });
      expect(droppedAgain.status).toBe('missing');
    } finally {
      await harness.close();
    }
  });

  it('supports rollback forward-compatibility (skips future ledger IDs), scope isolation, non-transactional DDL, and concurrent startup locking', async () => {
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      const sampleTable = defineSqlTable({
        name: 'sample_migrated',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          team_id: { kind: 'entityId' },
          create_time: { kind: 'timestamp' }
        }
      });

      let m1Executions = 0;
      const coreMigrations: SqlMigrationDefinition[] = [
        {
          id: '0001_create_sample',
          name: 'Create sample_migrated',
          scope: 'core',
          up: async ({ applyTableDDL }) => {
            m1Executions += 1;
            await applyTableDDL(sampleTable);
          }
        },
        {
          id: '0002_add_index_non_tx',
          name: 'Add index without outer tx',
          scope: 'core',
          transactional: false,
          up: async ({ ensureIndex }) => {
            const res = await ensureIndex({
              table: 'sample_migrated',
              index: {
                name: 'fg_sample_team_created',
                columns: ['team_id', { column: 'create_time', direction: 'desc' }]
              },
              concurrently: false
            });
            expect(res.status).toBe('created');
            // Calling ensureIndex a second time is idempotent
            const again = await ensureIndex({
              table: 'sample_migrated',
              index: {
                name: 'fg_sample_team_created',
                columns: ['team_id', { column: 'create_time', direction: 'desc' }]
              },
              concurrently: false
            });
            expect(again.status).toBe('exists');
          }
        }
      ];

      const mutex = createInMemoryMutexLock();
      // Dual-coroutine concurrent startup race
      const [r1, r2] = await Promise.all([
        runSqlMigrations({
          db: harness.db,
          dialect: 'postgres',
          scope: 'core',
          migrations: coreMigrations,
          lock: mutex.lock
        }),
        runSqlMigrations({
          db: harness.db,
          dialect: 'postgres',
          scope: 'core',
          migrations: coreMigrations,
          lock: mutex.lock
        })
      ]);

      expect(m1Executions).toBe(1);
      expect(mutex.acquisitions).toBe(2);
      expect([...r1.applied, ...r2.applied].sort()).toEqual([
        '0001_create_sample',
        '0002_add_index_non_tx'
      ]);

      // Pro scope runs independently in the same ledger table
      const proMigrations: SqlMigrationDefinition[] = [
        {
          id: '0001_pro_only',
          name: 'Pro migration',
          scope: 'pro',
          up: async () => undefined
        }
      ];
      const proRes = await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'pro',
        migrations: proMigrations
      });
      expect(proRes.applied).toEqual(['0001_pro_only']);

      // Simulate rolling back to an older release while DB ledger already has a future ID
      await harness.db
        .insertInto(SQL_MIGRATIONS_LEDGER_TABLE)
        .values({
          scope: 'core',
          id: '0099_future_release',
          name: 'Future release migration',
          checksum: 'future',
          executed_at: new Date(),
          duration_ms: 1
        })
        .execute();

      const rollbackRes = await runSqlMigrations({
        db: harness.db,
        dialect: 'postgres',
        scope: 'core',
        migrations: coreMigrations
      });
      expect(rollbackRes.applied).toEqual([]);
      expect(rollbackRes.skippedFutureIds).toEqual(['0099_future_release']);
      expect(rollbackRes.alreadyAppliedCount).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it('heals PG indisvalid=false zombie indexes and emits MySQL LOCK=NONE / OceanBase 1061-idempotent DDL', async () => {
    // 1. Verify PG zombie index self-healing SQL sequence via mock PG driver
    const pgExecuted: string[] = [];
    const pgDriver: Driver = {
      init: async () => undefined,
      acquireConnection: async () => ({
        executeQuery: async <R>(compiled: { sql: string }) => {
          pgExecuted.push(compiled.sql);
          if (compiled.sql.includes('FROM pg_index')) {
            return { rows: [{ indisvalid: false }] as unknown as R[] };
          }
          return { rows: [] as R[] };
        },
        streamQuery: async function* () {
          return;
        }
      }),
      beginTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      releaseConnection: async () => undefined,
      destroy: async () => undefined
    };

    const mockPgDb = new Kysely<any>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => pgDriver,
        createIntrospector: (db) => new MysqlIntrospector(db),
        createQueryCompiler: () => new MysqlQueryCompiler()
      }
    });

    const healed = await ensureSqlIndex({
      db: mockPgDb,
      dialect: 'postgres',
      table: 'demo_tbl',
      index: { name: 'fg_demo_healed', columns: ['team_id'] },
      concurrently: true
    });
    expect(healed.status).toBe('healed_and_created');
    expect(
      pgExecuted.some((q) => q.includes('DROP INDEX CONCURRENTLY IF EXISTS "fg_demo_healed"'))
    ).toBe(true);
    expect(
      pgExecuted.some((q) =>
        q.includes(
          'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fg_demo_healed" ON "demo_tbl" ("team_id")'
        )
      )
    ).toBe(true);

    // 2. Verify MySQL lock_wait_timeout + ALGORITHM=INPLACE LOCK=NONE + 1061 idempotency
    const mysqlExecuted: string[] = [];
    const mysqlDriver: Driver = {
      init: async () => undefined,
      acquireConnection: async () => ({
        executeQuery: async <R>(compiled: { sql: string }) => {
          mysqlExecuted.push(compiled.sql);
          if (compiled.sql.includes('information_schema.statistics')) {
            return { rows: [{ cnt: 0 }] as unknown as R[] };
          }
          if (compiled.sql.includes('ALGORITHM=INPLACE LOCK=NONE')) {
            const err = Object.assign(new Error('Duplicate key name'), { errno: 1061 });
            throw err;
          }
          return { rows: [] as R[] };
        },
        streamQuery: async function* () {
          return;
        }
      }),
      beginTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined,
      releaseConnection: async () => undefined,
      destroy: async () => undefined
    };

    const mockMysqlDb = new Kysely<any>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => mysqlDriver,
        createIntrospector: (db) => new MysqlIntrospector(db),
        createQueryCompiler: () => new MysqlQueryCompiler()
      }
    });

    const mysqlRes = await ensureSqlIndex({
      db: mockMysqlDb,
      dialect: 'mysql',
      table: 'demo_tbl',
      index: { name: 'fg_demo_mysql', columns: ['team_id'] },
      lockWaitTimeoutSec: 5
    });
    expect(mysqlRes.status).toBe('exists');
    expect(mysqlExecuted.some((q) => q.includes('SET SESSION lock_wait_timeout = 5'))).toBe(true);
    expect(mysqlExecuted.some((q) => q.includes('ALGORITHM=INPLACE LOCK=NONE'))).toBe(true);
  });
});
