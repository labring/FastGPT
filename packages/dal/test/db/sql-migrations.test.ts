import {
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type DatabaseConnection,
  type Driver
} from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbConfigurationError, DbError } from '@fastgpt/dal/db/errors';
import { coreSqlMigrations, coreSqlTables } from '@fastgpt/dal/db/repos/registry';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';
import {
  applySqlTableDDL,
  buildSqlMigrationLockKey,
  createRedisSqlMigrationLock,
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
  SqlMigrationLeaseGuard,
  SqlMigrationLock
} from '@fastgpt/dal/db/sql/migrations/types';
import { createPGliteSqlTestHarness } from '@fastgpt/dal/db/testing';
import type { LeaseCache } from '@fastgpt/dal/redis/caches/lease';

const createInMemoryMutexLock = (): {
  lock: SqlMigrationLock;
  acquisitions: number;
  keys: string[];
} => {
  let chain: Promise<void> = Promise.resolve();
  const state = { acquisitions: 0, keys: [] as string[] };

  const lock: SqlMigrationLock = {
    withLock: async ({ key, fn }) => {
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      const prev = chain;
      chain = prev.then(() => next);
      await prev;
      state.acquisitions += 1;
      state.keys.push(key);
      const lease: SqlMigrationLeaseGuard = {
        assertValid: () => undefined
      };
      try {
        return await fn(lease);
      } finally {
        release();
      }
    }
  };

  return {
    lock,
    get acquisitions() {
      return state.acquisitions;
    },
    get keys() {
      return state.keys;
    }
  };
};

const createMockMysqlKysely = (
  handler: (params: {
    connectionId: number;
    sql: string;
    parameters: readonly unknown[];
  }) => Promise<{ rows: unknown[] }> | { rows: unknown[] },
  hooks?: {
    onBeginTransaction?: () => void;
  }
): { db: Kysely<any>; acquireCount: () => number } => {
  let nextConnectionId = 0;

  const driver: Driver = {
    init: async () => undefined,
    acquireConnection: async () => {
      nextConnectionId += 1;
      const connectionId = nextConnectionId;
      const conn: DatabaseConnection = {
        executeQuery: async <R>(compiled: { sql: string; parameters: readonly unknown[] }) => {
          const result = await handler({
            connectionId,
            sql: compiled.sql,
            parameters: compiled.parameters
          });
          return { rows: result.rows as R[] };
        },
        streamQuery: async function* () {
          return;
        }
      };
      return conn;
    },
    beginTransaction: async () => {
      hooks?.onBeginTransaction?.();
    },
    commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined,
    releaseConnection: async () => undefined,
    destroy: async () => undefined
  };

  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (instance) => new MysqlIntrospector(instance),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });

  return {
    db,
    acquireCount: () => nextConnectionId
  };
};

const createMockPostgresKysely = (
  handler: (params: {
    connectionId: number;
    sql: string;
    parameters: readonly unknown[];
  }) => Promise<{ rows: unknown[] }> | { rows: unknown[] }
): Kysely<any> => {
  let nextConnectionId = 0;

  const driver: Driver = {
    init: async () => undefined,
    acquireConnection: async () => {
      nextConnectionId += 1;
      const connectionId = nextConnectionId;
      return {
        executeQuery: async <R>(compiled: { sql: string; parameters: readonly unknown[] }) => {
          const result = await handler({
            connectionId,
            sql: compiled.sql,
            parameters: compiled.parameters
          });
          return { rows: result.rows as R[] };
        },
        streamQuery: async function* () {
          return;
        }
      };
    },
    beginTransaction: async () => undefined,
    commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined,
    releaseConnection: async () => undefined,
    destroy: async () => undefined
  };

  return new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (instance) => new PostgresIntrospector(instance),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
};

describe('@fastgpt/dal/db/sql/migrations lightweight DDL runner & inspect', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('applies core migrations cleanly, passes full column/index anti-drift inspect, is idempotent, and protects customer DBA indexes', async () => {
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
      expect(firstRun.appliedEntries).toEqual([
        { datasource: 'main', id: '0001_init_app_registrations' }
      ]);
      expect(firstRun.skippedFutureIds).toEqual([]);
      expect(firstRun.alreadyAppliedCount).toBe(0);

      // 2. Anti-drift inspect must report 0 missing/mismatched tables, columns, or indexes
      const cleanReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: coreSqlTables
      });
      expect(cleanReport.missingTables).toEqual([]);
      expect(cleanReport.missingColumns).toEqual([]);
      expect(cleanReport.columnMismatches).toEqual([]);
      expect(cleanReport.missingIndexes).toEqual([]);
      expect(cleanReport.indexMismatches).toEqual([]);
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
  }, 30_000);

  const createDatasourceTopologyFixtures = () => {
    const mainTable = defineSqlTable({
      name: 'main_items',
      datasource: 'main',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        team_id: { kind: 'entityId' }
      },
      indexes: [{ name: 'fg_main_items_team', columns: ['team_id'] }]
    });
    const logTable = defineSqlTable({
      name: 'audit_logs',
      datasource: 'log',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        team_id: { kind: 'entityId' },
        created_at: { kind: 'timestamp' }
      },
      indexes: [
        {
          name: 'fg_audit_logs_team_time',
          columns: ['team_id', { column: 'created_at', direction: 'desc' }]
        }
      ]
    });

    // Both main and log deliberately share the EXACT same migration ID '0001_init_domain'
    const mixedMigrations: SqlMigrationDefinition[] = [
      {
        id: '0001_init_domain',
        name: 'Init main_items table',
        scope: 'core',
        datasource: 'main',
        up: async ({ applyTableDDL, datasource }) => {
          expect(datasource).toBe('main');
          await applyTableDDL(mainTable);
        }
      },
      {
        id: '0001_init_domain',
        name: 'Init audit_logs table',
        scope: 'core',
        datasource: 'log',
        up: async ({ applyTableDDL, datasource }) => {
          expect(datasource).toBe('log');
          await applyTableDDL(logTable);
        }
      }
    ];

    return { mainTable, logTable, mixedMigrations };
  };

  it('enforces strict datasource isolation in separate mode across main and log physical databases', async () => {
    const { mainTable, logTable, mixedMigrations } = createDatasourceTopologyFixtures();

    const separateHarness = await createPGliteSqlTestHarness({
      tables: [],
      logTables: [],
      logMode: 'separate'
    });
    try {
      const mainRes = await runSqlMigrations({
        db: separateHarness.db,
        dialect: 'postgres',
        scope: 'core',
        datasource: 'main',
        logMode: 'separate',
        migrations: mixedMigrations
      });
      expect(mainRes.datasources).toEqual(['main']);
      expect(mainRes.appliedEntries).toEqual([{ datasource: 'main', id: '0001_init_domain' }]);

      // Separate main DB must have main_items and MUST NOT have audit_logs
      const mainInspect = await inspectSqlSchema({
        db: separateHarness.db,
        dialect: 'postgres',
        datasource: 'main',
        tables: [mainTable, logTable]
      });
      expect(mainInspect.missingTables).toEqual(['audit_logs']);
      expect(mainInspect.missingColumns).toEqual([]);
      expect(mainInspect.primaryKeyMismatches).toEqual([]);
      expect(mainInspect.missingIndexes).toEqual([]);

      // Separate log DB (also verifies omitting logMode with datasource='log' defaults safely to ['log'])
      const logRes = await runSqlMigrations({
        db: separateHarness.logDb,
        dialect: 'postgres',
        scope: 'core',
        datasource: 'log',
        migrations: mixedMigrations
      });
      expect(logRes.datasources).toEqual(['log']);
      expect(logRes.appliedEntries).toEqual([{ datasource: 'log', id: '0001_init_domain' }]);

      // Separate log DB must have audit_logs and MUST NOT have main_items
      const logInspect = await inspectSqlSchema({
        db: separateHarness.logDb,
        dialect: 'postgres',
        datasource: 'log',
        tables: [mainTable, logTable]
      });
      expect(logInspect.missingTables).toEqual(['main_items']);
      expect(logInspect.missingColumns).toEqual([]);
      expect(logInspect.primaryKeyMismatches).toEqual([]);
      expect(logInspect.missingIndexes).toEqual([]);
    } finally {
      await separateHarness.close();
    }
  }, 30_000);

  it('executes both main and log migrations in shared mode without skipping same-ID migrations across datasources', async () => {
    const { mainTable, logTable, mixedMigrations } = createDatasourceTopologyFixtures();

    const sharedHarness = await createPGliteSqlTestHarness({ tables: [], logMode: 'shared' });
    try {
      const sharedRes = await runSqlMigrations({
        db: sharedHarness.db,
        dialect: 'postgres',
        scope: 'core',
        datasource: 'main',
        logMode: 'shared',
        migrations: mixedMigrations
      });
      expect(sharedRes.datasources).toEqual(['main', 'log']);
      expect(sharedRes.appliedEntries).toEqual([
        { datasource: 'main', id: '0001_init_domain' },
        { datasource: 'log', id: '0001_init_domain' }
      ]);

      const ledgerRows = await sharedHarness.db
        .selectFrom(SQL_MIGRATIONS_LEDGER_TABLE)
        .select(['scope', 'datasource', 'id'])
        .orderBy('datasource', 'asc')
        .execute();
      expect(ledgerRows).toEqual([
        { scope: 'core', datasource: 'log', id: '0001_init_domain' },
        { scope: 'core', datasource: 'main', id: '0001_init_domain' }
      ]);

      const sharedInspect = await inspectSqlSchema({
        db: sharedHarness.db,
        dialect: 'postgres',
        datasource: 'main',
        tables: [mainTable, logTable]
      });
      expect(sharedInspect.missingTables).toEqual([]);
      expect(sharedInspect.missingColumns).toEqual([]);
      expect(sharedInspect.columnMismatches).toEqual([]);
      expect(sharedInspect.primaryKeyMismatches).toEqual([]);
      expect(sharedInspect.missingIndexes).toEqual([]);
      expect(sharedInspect.indexMismatches).toEqual([]);

      // Re-running shared mode skips both cleanly
      const rerun = await runSqlMigrations({
        db: sharedHarness.db,
        dialect: 'postgres',
        scope: 'core',
        logMode: 'shared',
        migrations: mixedMigrations
      });
      expect(rerun.applied).toEqual([]);
      expect(rerun.alreadyAppliedCount).toBe(2);
    } finally {
      await sharedHarness.close();
    }
  }, 30_000);

  it('supports rollback forward-compatibility, physical-DB lock scoping across core/pro, non-transactional DDL, and concurrent startup locking', async () => {
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
            // Calling ensureIndex a second time with identical definition is idempotent
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

      // Pro scope targeting the SAME physical DB must serialize on the EXACT SAME physical lock key!
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
        migrations: proMigrations,
        lock: mutex.lock
      });
      expect(proRes.applied).toEqual(['0001_pro_only']);
      // All three acquisitions (core x2 + pro x1) share the exact same physical DB lock key
      expect(new Set(mutex.keys)).toEqual(new Set(['sql-migrations:postgres:main']));

      // Physical DB lock key helper strips credentials and yields identical keys for same DB
      const keyA = buildSqlMigrationLockKey({
        dialect: 'postgres',
        url: 'postgres://user1:secret1@db.internal:5432/fastgpt'
      });
      const keyB = buildSqlMigrationLockKey({
        dialect: 'postgres',
        url: 'postgres://user2:secret2@DB.INTERNAL:5432/fastgpt'
      });
      expect(keyA).toBe(keyB);
      expect(keyA).not.toContain('secret');

      // Simulate rolling back to an older release while DB ledger already has a future ID
      await harness.db
        .insertInto(SQL_MIGRATIONS_LEDGER_TABLE)
        .values({
          scope: 'core',
          datasource: 'main',
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
      expect(rollbackRes.skippedFutureEntries).toEqual([
        { datasource: 'main', id: '0099_future_release' }
      ]);
      expect(rollbackRes.alreadyAppliedCount).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it('propagates Redis lease guard and halts DDL & ledger writes immediately upon lease loss', async () => {
    // 1. Verify createRedisSqlMigrationLock passes LeaseCache context (signal + assertValid) through
    const abortController = new AbortController();
    const fakeAssertValid = vi.fn();
    const fakeLeaseCache = {
      withConcurrency: vi.fn(async ({ fn }: { fn: (ctx: any) => Promise<unknown> }) =>
        fn({ signal: abortController.signal, assertValid: fakeAssertValid })
      )
    } as unknown as LeaseCache;

    const redisLock = createRedisSqlMigrationLock({ leaseCache: fakeLeaseCache });
    await redisLock.withLock({
      key: 'sql-migrations:postgres:main',
      label: 'sql-migrations:core',
      fn: async (lease) => {
        expect(lease.signal).toBe(abortController.signal);
        lease.assertValid();
      }
    });
    expect(fakeAssertValid).toHaveBeenCalledTimes(1);

    // 2. Lease lost mid-migration (after m1, before m2 AND between DDL statements / before ledger insert)
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      let leaseValid = true;
      const leaseError = new Error('Redis lease was lost');
      const controllableLock: SqlMigrationLock = {
        withLock: async ({ fn }) =>
          fn({
            assertValid: () => {
              if (!leaseValid) {
                throw leaseError;
              }
            }
          })
      };

      const tableWithIndex = defineSqlTable({
        name: 'lease_guarded_tbl',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          team_id: { kind: 'entityId' }
        },
        indexes: [{ name: 'fg_lease_guarded_team', columns: ['team_id'] }]
      });

      // Case A: Lease lost right after up() completes and BEFORE ledger insert -> ledger must NOT be written
      let m2Called = false;
      const migrations: SqlMigrationDefinition[] = [
        {
          id: '0001_first',
          name: 'First migration',
          scope: 'core',
          transactional: false,
          up: async ({ applyTableDDL }) => {
            await applyTableDDL(tableWithIndex);
            // Simulate lease expiring while DDL finished right before ledger write
            leaseValid = false;
          }
        },
        {
          id: '0002_second',
          name: 'Second migration',
          scope: 'core',
          transactional: false,
          up: async () => {
            m2Called = true;
          }
        }
      ];

      await expect(
        runSqlMigrations({
          db: harness.db,
          dialect: 'postgres',
          scope: 'core',
          migrations,
          lock: controllableLock
        })
      ).rejects.toThrow('Redis lease was lost');

      expect(m2Called).toBe(false);
      const ledgerRows = await harness.db
        .selectFrom(SQL_MIGRATIONS_LEDGER_TABLE)
        .selectAll()
        .execute();
      expect(ledgerRows).toEqual([]);

      // Case B: Lease lost before applySqlTableDDL emits statement #2 (CREATE INDEX) -> halts immediately
      const issuedStatements: string[] = [];
      let stmtCount = 0;
      const mockPgDb = createMockPostgresKysely(({ sql: query }) => {
        issuedStatements.push(query);
        stmtCount += 1;
        return { rows: [] };
      });
      let innerLeaseValid = true;
      const leaseGuard: SqlMigrationLeaseGuard = {
        assertValid: () => {
          if (!innerLeaseValid) {
            throw leaseError;
          }
          if (stmtCount >= 1) {
            innerLeaseValid = false;
            throw leaseError;
          }
        }
      };

      await expect(
        applySqlTableDDL({
          db: mockPgDb,
          dialect: 'postgres',
          table: tableWithIndex,
          lease: leaseGuard
        })
      ).rejects.toThrow('Redis lease was lost');
      // Only CREATE TABLE ran before lease loss; CREATE INDEX was halted
      expect(issuedStatements).toHaveLength(1);
      expect(issuedStatements[0]).toContain('CREATE TABLE IF NOT EXISTS');
    } finally {
      await harness.close();
    }
  });

  it('refuses to drop PG indisvalid=false index when pg_stat_progress_create_index reports an active build, and heals only when idle', async () => {
    // 1. Active build in progress -> MUST NOT DROP, throws explicit error
    const activeExecuted: string[] = [];
    const activePgDb = createMockPostgresKysely(({ sql: query }) => {
      activeExecuted.push(query);
      if (query.includes('FROM pg_stat_progress_create_index')) {
        return { rows: [{ pid: 9911, phase: 'building index: scanning table' }] };
      }
      if (query.includes('FROM pg_index')) {
        return {
          rows: [
            {
              table_name: 'demo_tbl',
              index_name: 'fg_demo_active',
              indisvalid: false,
              indisprimary: false,
              indisunique: false,
              is_partial: false,
              seq_in_index: 1,
              column_name: 'team_id',
              is_desc: false
            }
          ]
        };
      }
      return { rows: [] };
    });

    await expect(
      ensureSqlIndex({
        db: activePgDb,
        dialect: 'postgres',
        table: 'demo_tbl',
        index: { name: 'fg_demo_active', columns: ['team_id'] },
        concurrently: true
      })
    ).rejects.toThrow(/active CREATE INDEX build is in progress/);
    expect(activeExecuted.some((q) => q.includes('DROP INDEX'))).toBe(false);

    // 2. Stale zombie index (indisvalid=false AND pg_stat_progress_create_index empty) -> heals and verifies
    const healedExecuted: string[] = [];
    let created = false;
    const zombiePgDb = createMockPostgresKysely(({ sql: query }) => {
      healedExecuted.push(query);
      if (query.includes('FROM pg_stat_progress_create_index')) {
        return { rows: [] };
      }
      if (query.includes('CREATE INDEX CONCURRENTLY IF NOT EXISTS')) {
        created = true;
        return { rows: [] };
      }
      if (query.includes('FROM pg_index')) {
        return {
          rows: [
            {
              table_name: 'demo_tbl',
              index_name: 'fg_demo_healed',
              indisvalid: created,
              indisprimary: false,
              indisunique: false,
              is_partial: false,
              seq_in_index: 1,
              column_name: 'team_id',
              is_desc: false
            }
          ]
        };
      }
      return { rows: [] };
    });

    const healed = await ensureSqlIndex({
      db: zombiePgDb,
      dialect: 'postgres',
      table: 'demo_tbl',
      index: { name: 'fg_demo_healed', columns: ['team_id'] },
      concurrently: true
    });
    expect(healed.status).toBe('healed_and_created');
    expect(
      healedExecuted.some((q) => q.includes('DROP INDEX CONCURRENTLY IF EXISTS "fg_demo_healed"'))
    ).toBe(true);
    expect(
      healedExecuted.some((q) =>
        q.includes(
          'CREATE INDEX CONCURRENTLY IF NOT EXISTS "fg_demo_healed" ON "demo_tbl" ("team_id")'
        )
      )
    ).toBe(true);
  });

  it('executes MySQL/OceanBase DDL non-transactionally and safely re-enters up() after a crash between DDL and ledger insert', async () => {
    // 1. Mock MySQL: verify NO fake beginTransaction and safe re-entry on crash right before ledger write
    let beginTxCount = 0;
    let tableCreated = false;
    let ledgerRecorded = false;
    let failLedgerInsertOnce = true;
    const ledgerSqls: string[] = [];

    const { db: mockMysqlDb } = createMockMysqlKysely(
      ({ sql: query }) => {
        if (query.includes('CREATE TABLE IF NOT EXISTS `_fg_sql_migrations`')) {
          return { rows: [] };
        }
        if (query.includes('from `_fg_sql_migrations`')) {
          return {
            rows: ledgerRecorded ? [{ datasource: 'main', id: '0001_reentrant_mysql' }] : []
          };
        }
        if (query.includes('CREATE TABLE IF NOT EXISTS `reentrant_tbl`')) {
          tableCreated = true;
          return { rows: [] };
        }
        if (query.includes('insert into `_fg_sql_migrations`')) {
          ledgerSqls.push(query);
          if (failLedgerInsertOnce) {
            failLedgerInsertOnce = false;
            throw new Error('simulated crash right before ledger insert');
          }
          ledgerRecorded = true;
          return { rows: [] };
        }
        return { rows: [] };
      },
      {
        onBeginTransaction: () => {
          beginTxCount += 1;
        }
      }
    );

    const reentrantTable = defineSqlTable({
      name: 'reentrant_tbl',
      columns: {
        _id: { kind: 'entityId', primaryKey: true },
        team_id: { kind: 'entityId' }
      },
      indexes: [{ name: 'fg_reentrant_team', columns: ['team_id'] }]
    });

    const mysqlMigrations: SqlMigrationDefinition[] = [
      {
        id: '0001_reentrant_mysql',
        name: 'Create reentrant_tbl',
        scope: 'core',
        transactional: true, // Even if true, MySQL/OB DDL commits implicitly so runner must NOT open a fake SQL tx
        up: async ({ applyTableDDL }) => {
          await applyTableDDL(reentrantTable);
        }
      }
    ];

    // First run: DDL succeeds, then crashes on ledger insert
    await expect(
      runSqlMigrations({
        db: mockMysqlDb,
        dialect: 'mysql',
        scope: 'core',
        migrations: mysqlMigrations
      })
    ).rejects.toThrow('simulated crash right before ledger insert');
    expect(beginTxCount).toBe(0);
    expect(tableCreated).toBe(true);
    expect(ledgerRecorded).toBe(false);

    // Second run: safely re-enters up() and records ledger idempotently with ON DUPLICATE KEY UPDATE
    const recoveryRes = await runSqlMigrations({
      db: mockMysqlDb,
      dialect: 'mysql',
      scope: 'core',
      migrations: mysqlMigrations
    });
    expect(beginTxCount).toBe(0);
    expect(recoveryRes.applied).toEqual(['0001_reentrant_mysql']);
    expect(ledgerRecorded).toBe(true);
    expect(ledgerSqls.some((q) => /on duplicate key update/i.test(q))).toBe(true);

    // Third run: already recorded -> clean no-op
    const thirdRes = await runSqlMigrations({
      db: mockMysqlDb,
      dialect: 'mysql',
      scope: 'core',
      migrations: mysqlMigrations
    });
    expect(thirdRes.applied).toEqual([]);
    expect(thirdRes.alreadyAppliedCount).toBe(1);
  });

  it('pins MySQL SET SESSION lock_wait_timeout + DDL on ONE connection, surfaces SET errors, and forbids silent blocking fallback by default', async () => {
    // 1. Same-connection pinning + 1061 post-create definition verification
    const executedOnConn: Array<{ connectionId: number; sql: string }> = [];
    let indexVisible = false;
    const { db: pinnedMysqlDb } = createMockMysqlKysely(({ connectionId, sql: query }) => {
      executedOnConn.push({ connectionId, sql: query });
      if (query.includes('information_schema.statistics')) {
        if (!indexVisible) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              table_name: 'demo_tbl',
              index_name: 'fg_demo_mysql',
              non_unique: 1,
              seq_in_index: 1,
              column_name: 'team_id',
              collation: 'A'
            }
          ]
        };
      }
      if (query.includes('ALGORITHM=INPLACE LOCK=NONE')) {
        indexVisible = true;
        throw Object.assign(new Error('Duplicate key name'), { errno: 1061 });
      }
      return { rows: [] };
    });

    const mysqlRes = await ensureSqlIndex({
      db: pinnedMysqlDb,
      dialect: 'mysql',
      table: 'demo_tbl',
      index: { name: 'fg_demo_mysql', columns: ['team_id'] },
      lockWaitTimeoutSec: 5
    });
    expect(mysqlRes.status).toBe('exists');
    const setEntry = executedOnConn.find((e) =>
      e.sql.includes('SET SESSION lock_wait_timeout = 5')
    );
    const createEntry = executedOnConn.find((e) => e.sql.includes('ALGORITHM=INPLACE LOCK=NONE'));
    expect(setEntry).toBeDefined();
    expect(createEntry).toBeDefined();
    expect(setEntry?.connectionId).toBe(createEntry?.connectionId);

    // 2. Rejects 1845 (LOCK=NONE unsupported) when allowBlockingFallback is false (default)
    const rejectedQueries: string[] = [];
    const { db: rejectBlockingDb } = createMockMysqlKysely(({ sql: query }) => {
      rejectedQueries.push(query);
      if (query.includes('information_schema.statistics')) {
        return { rows: [] };
      }
      if (query.includes('ALGORITHM=INPLACE LOCK=NONE')) {
        throw Object.assign(new Error('LOCK=NONE is not supported'), {
          errno: 1846,
          code: 'ER_ALTER_OPERATION_NOT_SUPPORTED_REASON'
        });
      }
      return { rows: [] };
    });

    await expect(
      ensureSqlIndex({
        db: rejectBlockingDb,
        dialect: 'mysql',
        table: 'demo_tbl',
        index: { name: 'fg_demo_online', columns: ['team_id'] }
      })
    ).rejects.toThrow(DbError);
    // Must NOT fall back to blocking CREATE INDEX without ALGORITHM=INPLACE LOCK=NONE
    expect(
      rejectedQueries.some(
        (q) => q.includes('CREATE INDEX') && !q.includes('ALGORITHM=INPLACE LOCK=NONE')
      )
    ).toBe(false);

    // 3. Explicit allowBlockingFallback: true retries on the SAME pinned connection
    const fallbackLog: Array<{ connectionId: number; sql: string }> = [];
    let createdViaFallback = false;
    const { db: optInBlockingDb } = createMockMysqlKysely(({ connectionId, sql: query }) => {
      fallbackLog.push({ connectionId, sql: query });
      if (query.includes('information_schema.statistics')) {
        if (!createdViaFallback) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              table_name: 'demo_tbl',
              index_name: 'fg_demo_optin',
              non_unique: 1,
              seq_in_index: 1,
              column_name: 'team_id',
              collation: 'A'
            }
          ]
        };
      }
      if (query.includes('ALGORITHM=INPLACE LOCK=NONE')) {
        throw Object.assign(new Error('ALGORITHM=INPLACE is not supported'), { errno: 1845 });
      }
      if (query.includes('CREATE INDEX `fg_demo_optin`')) {
        createdViaFallback = true;
        return { rows: [] };
      }
      return { rows: [] };
    });

    const optInRes = await ensureSqlIndex({
      db: optInBlockingDb,
      dialect: 'mysql',
      table: 'demo_tbl',
      index: { name: 'fg_demo_optin', columns: ['team_id'] },
      allowBlockingFallback: true
    });
    expect(optInRes.status).toBe('created');
    const fbSet = fallbackLog.find((e) => e.sql.includes('SET SESSION lock_wait_timeout'));
    const fbInplace = fallbackLog.find((e) => e.sql.includes('ALGORITHM=INPLACE LOCK=NONE'));
    const fbPlain = fallbackLog.find(
      (e) => e.sql.includes('CREATE INDEX') && !e.sql.includes('ALGORITHM=INPLACE LOCK=NONE')
    );
    expect(fbSet?.connectionId).toBe(fbInplace?.connectionId);
    expect(fbInplace?.connectionId).toBe(fbPlain?.connectionId);

    // 4. SET SESSION lock_wait_timeout non-1193 errors are NOT swallowed
    const { db: failingSetDb } = createMockMysqlKysely(({ sql: query }) => {
      if (query.includes('information_schema.statistics')) {
        return { rows: [] };
      }
      if (query.includes('SET SESSION lock_wait_timeout')) {
        throw Object.assign(new Error('Access denied'), {
          errno: 1227,
          code: 'ER_SPECIFIC_ACCESS_DENIED_ERROR'
        });
      }
      return { rows: [] };
    });

    await expect(
      ensureSqlIndex({
        db: failingSetDb,
        dialect: 'mysql',
        table: 'demo_tbl',
        index: { name: 'fg_demo_perm_err', columns: ['team_id'] }
      })
    ).rejects.toThrow('Access denied');

    // 5. dropSqlIndexIfExists also pins SET SESSION lock_wait_timeout + DROP INDEX onto ONE connection
    const dropConnLog: Array<{ connectionId: number; sql: string }> = [];
    const { db: dropMysqlDb } = createMockMysqlKysely(({ connectionId, sql: query }) => {
      dropConnLog.push({ connectionId, sql: query });
      if (query.includes('COUNT(*)')) {
        return { rows: [{ cnt: 1 }] };
      }
      return { rows: [] };
    });

    const dropRes = await dropSqlIndexIfExists({
      db: dropMysqlDb,
      dialect: 'mysql',
      table: 'demo_tbl',
      indexName: 'fg_demo_drop',
      lockWaitTimeoutSec: 7
    });
    expect(dropRes.status).toBe('dropped');
    const dropSet = dropConnLog.find((e) => e.sql.includes('SET SESSION lock_wait_timeout = 7'));
    const dropStmt = dropConnLog.find((e) => e.sql.includes('DROP INDEX `fg_demo_drop`'));
    expect(dropSet?.connectionId).toBe(dropStmt?.connectionId);
  });

  it('verifies FULL SQL index definitions (table, unique, column order, direction) in ensureSqlIndex and inspectSqlSchema across PG and MySQL', async () => {
    // 1. Real PGlite tests: wrong-table same-name index, non-unique vs unique, wrong column direction/order
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      const tableA = defineSqlTable({
        name: 'idx_table_a',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          team_id: { kind: 'entityId' },
          created_at: { kind: 'timestamp' }
        },
        indexes: [
          {
            name: 'fg_idx_a_team_time',
            unique: true,
            columns: ['team_id', { column: 'created_at', direction: 'desc' }]
          }
        ]
      });
      const tableB = defineSqlTable({
        name: 'idx_table_b',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          team_id: { kind: 'entityId' }
        },
        indexes: [{ name: 'fg_idx_a_team_time', columns: ['team_id'] }]
      });

      await applySqlTableDDL({ db: harness.db, dialect: 'postgres', table: tableA });
      await applySqlTableDDL({
        db: harness.db,
        dialect: 'postgres',
        table: defineSqlTable({
          name: 'idx_table_b',
          columns: {
            _id: { kind: 'entityId', primaryKey: true },
            team_id: { kind: 'entityId' }
          }
        })
      });

      // Wrong-table same-name index MUST be rejected by ensureSqlIndex
      await expect(
        ensureSqlIndex({
          db: harness.db,
          dialect: 'postgres',
          table: 'idx_table_b',
          index: { name: 'fg_idx_a_team_time', columns: ['team_id'] },
          concurrently: false
        })
      ).rejects.toThrow(/already exists on table "idx_table_a"/);

      // inspectSqlSchema also detects cross-table collision
      const crossTableInspect = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [tableB]
      });
      expect(crossTableInspect.missingIndexes).toEqual([
        { table: 'idx_table_b', indexName: 'fg_idx_a_team_time' }
      ]);
      expect(crossTableInspect.indexMismatches).toEqual([
        expect.objectContaining({
          table: 'idx_table_b',
          indexName: 'fg_idx_a_team_time',
          reason: expect.stringContaining('exists on table "idx_table_a"')
        })
      ]);

      // Non-unique declared vs live UNIQUE (and vice versa) MUST be rejected
      await expect(
        ensureSqlIndex({
          db: harness.db,
          dialect: 'postgres',
          table: 'idx_table_a',
          index: {
            name: 'fg_idx_a_team_time',
            unique: false,
            columns: ['team_id', { column: 'created_at', direction: 'desc' }]
          },
          concurrently: false
        })
      ).rejects.toThrow(/uniqueness mismatch/);

      // Wrong sort direction (ASC vs DESC) MUST be rejected
      await expect(
        ensureSqlIndex({
          db: harness.db,
          dialect: 'postgres',
          table: 'idx_table_a',
          index: {
            name: 'fg_idx_a_team_time',
            unique: true,
            columns: ['team_id', { column: 'created_at', direction: 'asc' }]
          },
          concurrently: false
        })
      ).rejects.toThrow(/definition mismatch/);

      // inspectSqlSchema detects mismatched unique + direction against declared table
      const driftedTableA = defineSqlTable({
        name: 'idx_table_a',
        columns: tableA.columns,
        indexes: [
          {
            name: 'fg_idx_a_team_time',
            unique: false,
            columns: ['team_id', 'created_at']
          }
        ]
      });
      const mismatchReport = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [driftedTableA]
      });
      expect(mismatchReport.indexMismatches).toHaveLength(1);
      expect(mismatchReport.indexMismatches[0]?.reason).toContain('uniqueness mismatch');
    } finally {
      await harness.close();
    }

    // 2. Mocked MySQL tests: wrong-table collision & post-1061 non-unique mismatch caught!
    const { db: wrongTableMysqlDb } = createMockMysqlKysely(({ sql: query }) => {
      if (query.includes('information_schema.statistics')) {
        return {
          rows: [
            {
              table_name: 'other_tbl',
              index_name: 'fg_mysql_clash',
              non_unique: 1,
              seq_in_index: 1,
              column_name: 'team_id',
              collation: 'A'
            }
          ]
        };
      }
      return { rows: [] };
    });

    await expect(
      ensureSqlIndex({
        db: wrongTableMysqlDb,
        dialect: 'mysql',
        table: 'target_tbl',
        index: { name: 'fg_mysql_clash', columns: ['team_id'] }
      })
    ).rejects.toThrow(/already exists on table "other_tbl"/);

    // Concurrent 1061 where live index is NON-UNIQUE while declared requires UNIQUE -> caught on re-inspect!
    let raceCreated = false;
    const { db: mismatch1061MysqlDb } = createMockMysqlKysely(({ sql: query }) => {
      if (query.includes('information_schema.statistics')) {
        if (!raceCreated) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              table_name: 'target_tbl',
              index_name: 'fg_mysql_uniq',
              non_unique: 1, // NON-UNIQUE in DB!
              seq_in_index: 1,
              column_name: 'team_id',
              collation: 'A'
            }
          ]
        };
      }
      if (query.includes('CREATE UNIQUE INDEX')) {
        raceCreated = true;
        throw Object.assign(new Error('Duplicate key name'), { errno: 1061 });
      }
      return { rows: [] };
    });

    await expect(
      ensureSqlIndex({
        db: mismatch1061MysqlDb,
        dialect: 'mysql',
        table: 'target_tbl',
        index: { name: 'fg_mysql_uniq', unique: true, columns: ['team_id'] }
      })
    ).rejects.toThrow(/uniqueness mismatch/);
  });

  it('detects missing columns and column type/nullability/default mismatches in inspectSqlSchema on PG and MySQL', async () => {
    // 1. PGlite column drift detection (all portable types + defaults)
    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      const fullTable = defineSqlTable({
        name: 'col_check_tbl',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          title: { kind: 'varchar', length: 64, defaultValue: "it's ok" },
          enabled: { kind: 'boolean', defaultValue: true },
          retries: { kind: 'integer', defaultValue: 3 },
          total_bytes: { kind: 'bigint', defaultValue: 0 },
          ratio: { kind: 'double', defaultValue: 0.5 },
          body: { kind: 'text', nullable: true },
          meta: { kind: 'json', nullable: true },
          created_at: { kind: 'timestamp', nullable: true }
        }
      });
      await applySqlTableDDL({ db: harness.db, dialect: 'postgres', table: fullTable });

      const clean = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [fullTable]
      });
      expect(clean.missingColumns).toEqual([]);
      expect(clean.columnMismatches).toEqual([]);

      // Mutate declared expectation: extra missing column + changed varchar length + changed nullability + changed default
      const driftedTable = defineSqlTable({
        name: 'col_check_tbl',
        columns: {
          ...fullTable.columns,
          title: { kind: 'varchar', length: 128, defaultValue: 'different' },
          created_at: { kind: 'timestamp', nullable: false },
          added_without_migration: { kind: 'varchar', length: 32, nullable: true }
        }
      });

      const drifted = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [driftedTable]
      });
      expect(drifted.missingColumns).toEqual([
        { table: 'col_check_tbl', column: 'added_without_migration' }
      ]);
      expect(drifted.columnMismatches.map((m) => m.column).sort()).toEqual(['created_at', 'title']);
    } finally {
      await harness.close();
    }

    // 2. Mocked MySQL column drift detection (DATETIME(0) vs DATETIME(3) and TEXT vs LONGTEXT)
    const { db: mockMysqlInspectDb } = createMockMysqlKysely(({ sql: query }) => {
      if (query.includes('information_schema.tables')) {
        return { rows: [{ table_name: 'mysql_col_tbl' }] };
      }
      if (query.includes('information_schema.columns')) {
        return {
          rows: [
            {
              table_name: 'mysql_col_tbl',
              column_name: '_id',
              data_type: 'varchar',
              column_type: 'varchar(24)',
              character_maximum_length: 24,
              datetime_precision: null,
              is_nullable: 'NO',
              column_default: null
            },
            {
              table_name: 'mysql_col_tbl',
              column_name: 'body',
              data_type: 'text', // 64KB TEXT instead of LONGTEXT!
              column_type: 'text',
              character_maximum_length: 65535,
              datetime_precision: null,
              is_nullable: 'YES',
              column_default: null
            },
            {
              table_name: 'mysql_col_tbl',
              column_name: 'created_at',
              data_type: 'datetime',
              column_type: 'datetime',
              character_maximum_length: null,
              datetime_precision: 0, // Missing (3) ms precision!
              is_nullable: 'YES',
              column_default: null
            }
          ]
        };
      }
      if (query.includes('information_schema.statistics')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const mysqlReport = await inspectSqlSchema({
      db: mockMysqlInspectDb,
      dialect: 'mysql',
      tables: [
        defineSqlTable({
          name: 'mysql_col_tbl',
          columns: {
            _id: { kind: 'entityId', primaryKey: true },
            body: { kind: 'text', nullable: true },
            created_at: { kind: 'timestamp', nullable: true }
          }
        })
      ]
    });
    expect(mysqlReport.columnMismatches.map((m) => m.column).sort()).toEqual([
      'body',
      'created_at'
    ]);
    expect(mysqlReport.primaryKeyMismatches).toEqual([
      expect.objectContaining({
        table: 'mysql_col_tbl',
        expected: ['_id'],
        actual: []
      })
    ]);
  });

  it('inspectSqlSchema verifies composite PRIMARY KEY column order on PGlite and MySQL/OceanBase', async () => {
    const compositeTable = defineSqlTable({
      name: 'composite_pk_tbl',
      columns: {
        tenant_id: { kind: 'entityId', primaryKey: true },
        item_id: { kind: 'entityId', primaryKey: true }
      }
    });

    const harness = await createPGliteSqlTestHarness({ tables: [] });
    try {
      await sql
        .raw(
          `
        CREATE TABLE "composite_pk_tbl" (
          "tenant_id" VARCHAR(24) NOT NULL,
          "item_id" VARCHAR(24) NOT NULL,
          PRIMARY KEY ("item_id", "tenant_id")
        );
      `
        )
        .execute(harness.db);

      const report = await inspectSqlSchema({
        db: harness.db,
        dialect: 'postgres',
        tables: [compositeTable]
      });
      expect(report.primaryKeyMismatches).toEqual([
        expect.objectContaining({
          table: 'composite_pk_tbl',
          expected: ['tenant_id', 'item_id'],
          actual: ['item_id', 'tenant_id'],
          reason: expect.stringContaining('PRIMARY KEY mismatch')
        })
      ]);
    } finally {
      await harness.close();
    }

    const { db: mockMysqlPkDb } = createMockMysqlKysely(({ sql: query }) => {
      if (query.includes('information_schema.tables')) {
        return { rows: [{ table_name: 'composite_pk_tbl' }] };
      }
      if (query.includes('information_schema.columns')) {
        return {
          rows: [
            {
              table_name: 'composite_pk_tbl',
              column_name: 'tenant_id',
              data_type: 'varchar',
              column_type: 'varchar(24)',
              character_maximum_length: 24,
              datetime_precision: null,
              is_nullable: 'NO',
              column_default: null
            },
            {
              table_name: 'composite_pk_tbl',
              column_name: 'item_id',
              data_type: 'varchar',
              column_type: 'varchar(24)',
              character_maximum_length: 24,
              datetime_precision: null,
              is_nullable: 'NO',
              column_default: null
            }
          ]
        };
      }
      if (query.includes('information_schema.statistics')) {
        return {
          rows: [
            {
              table_name: 'composite_pk_tbl',
              index_name: 'PRIMARY',
              non_unique: 0,
              seq_in_index: 1,
              column_name: 'item_id',
              collation: 'A'
            },
            {
              table_name: 'composite_pk_tbl',
              index_name: 'PRIMARY',
              non_unique: 0,
              seq_in_index: 2,
              column_name: 'tenant_id',
              collation: 'A'
            }
          ]
        };
      }
      return { rows: [] };
    });

    const mysqlPkMismatch = await inspectSqlSchema({
      db: mockMysqlPkDb,
      dialect: 'mysql',
      tables: [compositeTable]
    });
    expect(mysqlPkMismatch.primaryKeyMismatches).toEqual([
      expect.objectContaining({
        table: 'composite_pk_tbl',
        expected: ['tenant_id', 'item_id'],
        actual: ['item_id', 'tenant_id']
      })
    ]);
  });
});
