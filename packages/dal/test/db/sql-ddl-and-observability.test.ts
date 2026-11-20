import { Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler, type Driver } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { createEntityId, EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import { SqlRepositoryBase } from '@fastgpt/dal/db/sql/base';
import {
  compileSqlTableDDL,
  defineSqlTable,
  validateSqlTableRegistry
} from '@fastgpt/dal/db/sql/ddl';
import { createSqlQueryLogger, parseSqlOperationSummary } from '@fastgpt/dal/db/sql/observability';
import { createPGliteSqlTestHarness } from '@fastgpt/dal/db/testing';

const SortableRowSchema = z.object({
  _id: EntityIdSchema,
  name: z.string(),
  score: z.number().nullable()
});

type SortableRow = {
  _id: string;
  name: string;
  score: number | null;
};

type SortableDb = {
  sortable_items: SortableRow;
};

const sortableTable = defineSqlTable({
  name: 'sortable_items',
  columns: {
    _id: { kind: 'entityId', primaryKey: true },
    name: { kind: 'varchar', length: 64 },
    score: { kind: 'integer', nullable: true }
  },
  indexes: [
    { name: 'fg_sort_score_desc', columns: [{ column: 'score', direction: 'desc' }, '_id'] }
  ]
});

class SortableSqlRepo extends SqlRepositoryBase<
  SortableDb,
  'sortable_items',
  typeof SortableRowSchema
> {
  protected readonly tableName = 'sortable_items';
  protected readonly readSchema = SortableRowSchema;

  async insertIfAbsent(row: SortableRow): Promise<void> {
    await this.upsertRow({
      values: row,
      conflictKeys: ['_id']
    });
  }

  async listSorted({
    direction,
    nulls
  }: {
    direction: 'asc' | 'desc';
    nulls: 'first' | 'last';
  }): Promise<Array<z.output<typeof SortableRowSchema>>> {
    const baseQuery = this.readDb().selectFrom('sortable_items').selectAll();
    const rows = await this.orderByNullable({
      query: baseQuery,
      column: 'score',
      direction,
      nulls
    })
      .orderBy('_id', 'asc')
      .execute();
    return this.parseList(rows);
  }

  async collectKeysetBatches(batchSize: number): Promise<string[][]> {
    const batches: string[][] = [];
    for await (const batch of this.iterateByKeyset({
      batchSize,
      getCursor: (row) => row._id,
      fetchBatch: async ({ afterId, limit }) => {
        let query = this.readDb().selectFrom('sortable_items').selectAll();
        if (afterId !== undefined) {
          query = query.where('_id', '>', afterId);
        }
        const rows = await query.orderBy('_id', 'asc').limit(limit).execute();
        return this.parseList(rows);
      }
    })) {
      batches.push(batch.map((r) => r._id));
    }
    return batches;
  }

  async runNonMonotonicKeyset(): Promise<void> {
    for await (const _batch of this.iterateByKeyset({
      batchSize: 1,
      getCursor: () => '000000000000000000000001',
      fetchBatch: async () => [{ _id: '000000000000000000000001', name: 'stuck', score: 1 }]
    })) {
      // intentionally drains until guard throws
    }
  }
}

describe('@fastgpt/dal/db/sql Phase 0.5.3 OceanBase/MySQL guardrails & helpers', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('enforces fg_ index naming, 63B cap, no text/json defaults or indexes, and 3072B utf8mb4 index width', () => {
    expect(() =>
      defineSqlTable({
        name: 'bad_prefix',
        columns: { _id: { kind: 'entityId', primaryKey: true }, team_id: { kind: 'entityId' } },
        indexes: [{ name: 'idx_team_id', columns: ['team_id'] }]
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineSqlTable({
        name: 'too_long_idx',
        columns: { _id: { kind: 'entityId', primaryKey: true }, team_id: { kind: 'entityId' } },
        indexes: [{ name: `fg_${'a'.repeat(61)}`, columns: ['team_id'] }]
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineSqlTable({
        name: 'bad_text_default',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          body: { kind: 'text', defaultValue: '' }
        }
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineSqlTable({
        name: 'bad_json_index',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          meta: { kind: 'json', nullable: true }
        },
        indexes: [{ name: 'fg_bad_json', columns: ['meta'] }]
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      defineSqlTable({
        name: 'wide_index',
        columns: {
          _id: { kind: 'entityId', primaryKey: true },
          a: { kind: 'varchar', length: 500 },
          b: { kind: 'varchar', length: 500 }
        },
        indexes: [{ name: 'fg_too_wide', columns: ['a', 'b'] }]
      })
    ).toThrow(DbConfigurationError);

    const t1 = defineSqlTable({
      name: 'reg_a',
      columns: { _id: { kind: 'entityId', primaryKey: true }, team_id: { kind: 'entityId' } },
      indexes: [{ name: 'fg_shared_collision', columns: ['team_id'] }]
    });
    const t2 = defineSqlTable({
      name: 'reg_b',
      columns: { _id: { kind: 'entityId', primaryKey: true }, team_id: { kind: 'entityId' } },
      indexes: [{ name: 'fg_shared_collision', columns: ['team_id'] }]
    });
    expect(() => validateSqlTableRegistry([t1, t2])).toThrow(DbConfigurationError);
  });

  it('compiles DESC index columns and utf8mb4_bin collation cleanly for OceanBase/MySQL and PG', () => {
    const obDdl = compileSqlTableDDL(sortableTable, 'oceanbase').join('\n');
    expect(obDdl).toContain('KEY `fg_sort_score_desc` (`score` DESC, `_id`)');
    expect(obDdl).toContain('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;');

    const pgDdl = compileSqlTableDDL(sortableTable, 'postgres').join('\n');
    expect(pgDdl).toContain(
      'CREATE INDEX IF NOT EXISTS "fg_sort_score_desc" ON "sortable_items" ("score" DESC, "_id");'
    );
  });

  it('compiles upsertRow without updateValues to ON DUPLICATE KEY UPDATE (never INSERT IGNORE) on OceanBase/MySQL', async () => {
    const executedSql: string[] = [];
    const fakeDriver: Driver = {
      init: async () => undefined,
      acquireConnection: async () => ({
        executeQuery: async (compiled) => {
          executedSql.push(compiled.sql);
          return { rows: [] };
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

    const obKysely = new Kysely<SortableDb>({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => fakeDriver,
        createIntrospector: (db) => new MysqlIntrospector(db),
        createQueryCompiler: () => new MysqlQueryCompiler()
      }
    });

    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      sqlExecutorResolver: () => obKysely
    });

    const repo = new SortableSqlRepo();
    await repo.insertIfAbsent({ _id: createEntityId(), name: 'alpha', score: 10 });

    expect(executedSql).toHaveLength(1);
    expect(executedSql[0]).toMatch(/on duplicate key update\s+`_id`\s*=\s*`_id`/i);
    expect(executedSql[0]).not.toMatch(/\bignore\b/i);
  });

  it('sorts nullable columns identically across all 4 asc/desc x first/last modes and paginates with Keyset cursor', async () => {
    const harness = await createPGliteSqlTestHarness({ tables: [sortableTable] });
    try {
      const repo = new SortableSqlRepo();
      const ids = [
        '660000000000000000000001',
        '660000000000000000000002',
        '660000000000000000000003',
        '660000000000000000000004',
        '660000000000000000000005'
      ];
      await repo.insertIfAbsent({ _id: ids[0], name: 'n1', score: null });
      await repo.insertIfAbsent({ _id: ids[1], name: 's20', score: 20 });
      await repo.insertIfAbsent({ _id: ids[2], name: 's10', score: 10 });
      await repo.insertIfAbsent({ _id: ids[3], name: 'n2', score: null });
      await repo.insertIfAbsent({ _id: ids[4], name: 's30', score: 30 });
      // Duplicate insert without updateValues should be a safe no-op
      await repo.insertIfAbsent({ _id: ids[4], name: 'ignored', score: 999 });

      const ascNullsLast = await repo.listSorted({ direction: 'asc', nulls: 'last' });
      expect(ascNullsLast.map((r) => r.score)).toEqual([10, 20, 30, null, null]);

      const descNullsLast = await repo.listSorted({ direction: 'desc', nulls: 'last' });
      expect(descNullsLast.map((r) => r.score)).toEqual([30, 20, 10, null, null]);

      const ascNullsFirst = await repo.listSorted({ direction: 'asc', nulls: 'first' });
      expect(ascNullsFirst.map((r) => r.score)).toEqual([null, null, 10, 20, 30]);

      const descNullsFirst = await repo.listSorted({ direction: 'desc', nulls: 'first' });
      expect(descNullsFirst.map((r) => r.score)).toEqual([null, null, 30, 20, 10]);

      const batches = await repo.collectKeysetBatches(2);
      expect(batches).toEqual([[ids[0], ids[1]], [ids[2], ids[3]], [ids[4]]]);

      await expect(repo.runNonMonotonicKeyset()).rejects.toThrow(DbConfigurationError);
    } finally {
      await harness.close();
    }
  });

  it('pipes Kysely query timings and errors into DbRuntime.recordOperation()', () => {
    expect(parseSqlOperationSummary('SELECT * FROM `app_registrations` WHERE _id = ?')).toEqual({
      operation: 'select',
      table: 'app_registrations'
    });
    expect(parseSqlOperationSummary('INSERT INTO "demo_items" (_id) VALUES ($1)')).toEqual({
      operation: 'insert',
      table: 'demo_items'
    });

    const operationCompleted = vi.fn();
    const slowQuery = vi.fn();
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      metrics: { operationCompleted, slowQuery }
    });

    const logListener = createSqlQueryLogger('main');
    logListener({
      level: 'query',
      query: {
        sql: 'SELECT * FROM `apps` WHERE `team_id` = ?',
        parameters: [],
        query: {} as any,
        queryId: { queryId: 'q1' }
      },
      queryDurationMillis: 620
    });
    logListener({
      level: 'error',
      error: new Error('deadlock'),
      query: {
        sql: 'UPDATE `apps` SET `name` = ?',
        parameters: [],
        query: {} as any,
        queryId: { queryId: 'q2' }
      },
      queryDurationMillis: 15
    });

    expect(operationCompleted).toHaveBeenCalledTimes(2);
    expect(operationCompleted).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dialect: 'oceanbase',
        datasource: 'main',
        table: 'apps',
        operation: 'select',
        durationMs: 620,
        success: true
      })
    );
    expect(operationCompleted).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        table: 'apps',
        operation: 'update',
        success: false
      })
    );
    expect(slowQuery).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'apps', severity: 'warn', durationMs: 620 })
    );
  });
});
