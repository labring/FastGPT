import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import { createEntityId, EntityIdSchema } from '@fastgpt/global/common/string/entityId';
import { BoolSchema, optionalNullToUndefined } from '@fastgpt/global/common/zod';
import {
  clearRepoOverrides,
  defineLogRepoToken,
  defineRepoToken,
  injectRepo,
  overrideRepoForTest
} from '@fastgpt/dal/db/container';
import { MongoRepositoryBase } from '@fastgpt/dal/db/mongo/base';
import { jsonColumnSchema } from '@fastgpt/dal/db/parse';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import { SqlRepositoryBase } from '@fastgpt/dal/db/sql/base';
import { compileSqlTableDDL, defineSqlTable } from '@fastgpt/dal/db/sql/ddl';
import { createPGliteSqlTestHarness } from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';

const ItemReadSchema = z.object({
  _id: EntityIdSchema,
  team_id: EntityIdSchema,
  parent_id: z.string().nullable(),
  name: z.string(),
  enabled: BoolSchema,
  tags: optionalNullToUndefined(jsonColumnSchema(z.array(z.string()))),
  ancestor_path: z.string()
});

type ItemRow = {
  _id: string;
  team_id: string;
  parent_id: string;
  name: string;
  enabled: boolean | number;
  tags: unknown;
  ancestor_path: string;
};

type TestDatabase = {
  demo_items: ItemRow;
};

const demoItemsTable = defineSqlTable({
  name: 'demo_items',
  columns: {
    _id: { kind: 'entityId', primaryKey: true },
    team_id: { kind: 'entityId' },
    parent_id: { kind: 'varchar', length: 24, defaultValue: '' },
    name: { kind: 'varchar', length: 128 },
    enabled: { kind: 'boolean', defaultValue: true },
    tags: { kind: 'json', nullable: true },
    ancestor_path: { kind: 'varchar', length: 512, defaultValue: '' }
  },
  indexes: [
    { name: 'uniq_team_parent_name', columns: ['team_id', 'parent_id', 'name'], unique: true },
    { name: 'idx_team_ancestor', columns: ['team_id', 'ancestor_path'] }
  ]
});

type ItemRepo = {
  getTag: () => string;
  upsertItem: (params: {
    id?: string;
    teamId: string;
    parentId: string | null;
    name: string;
    enabled: boolean;
    tags?: string[];
    ancestorIds?: string[];
    tx?: DbSession;
  }) => Promise<z.output<typeof ItemReadSchema>>;
  searchByName: (params: {
    teamId: string;
    keyword: string;
  }) => Promise<z.output<typeof ItemReadSchema>[]>;
  bulkInsert: (
    rows: Array<
      Partial<ItemRow> & Pick<ItemRow, '_id' | 'team_id' | 'parent_id' | 'name' | 'ancestor_path'>
    >
  ) => Promise<void>;
  countAll: () => Promise<number>;
};

class MongoItemRepo extends MongoRepositoryBase<typeof ItemReadSchema> implements ItemRepo {
  protected readonly tableName = 'demo_items';
  protected readonly readSchema = ItemReadSchema;

  getTag() {
    return `mongo:${this.oid(createEntityId()).toHexString().length}`;
  }

  async upsertItem(): Promise<z.output<typeof ItemReadSchema>> {
    throw new Error('Not needed in container routing test');
  }

  async searchByName() {
    return [];
  }

  async bulkInsert() {
    return;
  }

  async countAll() {
    return 0;
  }
}

class SqlItemRepo
  extends SqlRepositoryBase<TestDatabase, 'demo_items', typeof ItemReadSchema>
  implements ItemRepo
{
  protected readonly tableName = 'demo_items';
  protected readonly readSchema = ItemReadSchema;

  getTag() {
    return `sql:${this.sqlDialect}`;
  }

  async upsertItem({
    id,
    teamId,
    parentId,
    name,
    enabled,
    tags,
    ancestorIds,
    tx
  }: {
    id?: string;
    teamId: string;
    parentId: string | null;
    name: string;
    enabled: boolean;
    tags?: string[];
    ancestorIds?: string[];
    tx?: DbSession;
  }) {
    const _id = id ?? createEntityId();
    await this.upsertRow({
      values: {
        _id,
        team_id: teamId,
        parent_id: this.toParentSentinel(parentId),
        name,
        enabled,
        tags: this.toJsonParam(tags),
        ancestor_path: this.encodeMaterializedPath(ancestorIds)
      },
      conflictKeys: ['team_id', 'parent_id', 'name'],
      updateValues: {
        enabled,
        tags: this.toJsonParam(tags),
        ancestor_path: this.encodeMaterializedPath(ancestorIds)
      },
      tx
    });

    const row = await this.db(tx)
      .selectFrom('demo_items')
      .selectAll()
      .where('team_id', '=', teamId)
      .where('parent_id', '=', this.toParentSentinel(parentId))
      .where('name', '=', name)
      .executeTakeFirst();

    return {
      ...this.parseRow(row),
      parent_id: this.fromParentSentinel((row as ItemRow).parent_id)
    };
  }

  async searchByName({ teamId, keyword }: { teamId: string; keyword: string }) {
    const rows = await this.readDb()
      .selectFrom('demo_items')
      .selectAll()
      .where('team_id', '=', teamId)
      .where(this.caseInsensitiveLike('name', keyword))
      .execute();

    return this.parseList(rows);
  }

  async bulkInsert(
    rows: Array<
      Partial<ItemRow> & Pick<ItemRow, '_id' | 'team_id' | 'parent_id' | 'name' | 'ancestor_path'>
    >
  ) {
    await this.insertChunked({
      rows: rows.map((r) => ({
        ...r,
        ...(r.tags !== undefined ? { tags: this.toJsonParam(r.tags) } : {})
      })),
      maxParamsPerBatch: 21 // 最大 7 列 * 3 行，强制验证异构行键数下的自动分片逻辑
    });
  }

  async countAll() {
    const res = await this.readDb()
      .selectFrom('demo_items')
      .select((eb) => eb.fn.countAll<string>().as('cnt'))
      .executeTakeFirstOrThrow();
    return Number(res.cnt);
  }
}

type AuditLogRepo = {
  mode: () => 'mongo' | 'sql' | 'noop';
};

describe('@fastgpt/dal/db DI container, portable SQL DDL, and PGlite integration', () => {
  afterEach(async () => {
    clearRepoOverrides();
    await closeDbRuntime();
  });

  it('defers instantiation, prevents await .then trap, and routes postgres/oceanbase/mysql to sql factory', async () => {
    const mongoSpy = vi.fn(() => new MongoItemRepo());
    const sqlSpy = vi.fn(() => new SqlItemRepo());

    const ItemRepoToken = defineRepoToken<ItemRepo>('ItemRepo', {
      mongo: mongoSpy,
      sql: sqlSpy
    });

    const repo = injectRepo(ItemRepoToken);
    expect(mongoSpy).not.toHaveBeenCalled();
    expect(sqlSpy).not.toHaveBeenCalled();

    const awaitedRepo = await Promise.resolve(repo);
    expect(awaitedRepo).toBe(repo);
    expect(mongoSpy).not.toHaveBeenCalled();

    configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://localhost:27017/fastgpt'
    });
    expect(repo.getTag()).toBe('mongo:24');
    expect(mongoSpy).toHaveBeenCalledTimes(1);

    await closeDbRuntime();
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt'
    });
    expect(repo.getTag()).toBe('sql:oceanbase');
    expect(sqlSpy).toHaveBeenCalledTimes(1);
  });

  it('routes defineLogRepoToken across shared, separate, and disabled logMode topologies', async () => {
    const LogRepoToken = defineLogRepoToken<AuditLogRepo>('AuditLogRepo', {
      mongo: () => ({ mode: () => 'mongo' }),
      sql: () => ({ mode: () => 'sql' }),
      noop: () => ({ mode: () => 'noop' })
    });

    const logRepo = injectRepo(LogRepoToken);

    // 默认 shared 模式复用主库连接池，仍走真实 sql 仓储
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt'
    });
    expect(logRepo.mode()).toBe('sql');

    // 显式关闭日志库持久化（logDisabled: true）时自动降级至 Noop 空实现
    await closeDbRuntime();
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logDisabled: true
    });
    expect(logRepo.mode()).toBe('noop');

    // separate 模式使用独立日志库连接池
    await closeDbRuntime();
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      logWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt_log'
    });
    expect(logRepo.mode()).toBe('sql');

    const restore = overrideRepoForTest(LogRepoToken, { mode: () => 'mongo' });
    expect(logRepo.mode()).toBe('mongo');
    restore();
    expect(logRepo.mode()).toBe('sql');
  });

  it('compiles portable DDL for both PostgreSQL and OceanBase/MySQL without dialect leaks', () => {
    const pgSql = compileSqlTableDDL(demoItemsTable, 'postgres').join('\n');
    expect(pgSql).toContain('"tags" JSONB');
    expect(pgSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "uniq_team_parent_name"');

    const obSql = compileSqlTableDDL(demoItemsTable, 'oceanbase').join('\n');
    expect(obSql).toContain('`tags` JSON');
    expect(obSql).toContain('`enabled` TINYINT(1) NOT NULL DEFAULT 1');
    expect(obSql).toContain('UNIQUE KEY `uniq_team_parent_name`');
    expect(obSql).not.toContain('CREATE INDEX IF NOT EXISTS');
  });

  it('runs real SQL queries, JSON array persistence, sentinel uniqueness, LIKE escaping, chunked inserts, and transaction rollback on PGlite', async () => {
    const harness = await createPGliteSqlTestHarness({ tables: [demoItemsTable] });
    try {
      const repo = injectRepo(
        defineRepoToken<ItemRepo>('DemoItemRepo', {
          mongo: () => new MongoItemRepo(),
          sql: () => new SqlItemRepo()
        })
      );

      const teamId = createEntityId();
      const rootFolderId = createEntityId();
      const afterCommitCalls: string[] = [];

      // 1. 测试事务内 upsert + JSON 数组序列化（防止 pg array 字面量陷阱）+ afterCommit
      const first = await runInTransaction(async (tx) => {
        const created = await repo.upsertItem({
          teamId,
          parentId: null,
          name: '100% Agent_Bot | Test',
          enabled: true,
          tags: ['alpha', 'beta'],
          ancestorIds: [rootFolderId],
          tx
        });
        tx.afterCommit(() => {
          afterCommitCalls.push(created._id);
        });
        return created;
      });

      expect(first.parent_id).toBeNull();
      expect(first.tags).toEqual(['alpha', 'beta']);
      expect(first.ancestor_path).toBe(`${rootFolderId}/`);
      expect(afterCommitCalls).toEqual([first._id]);

      // 2. 验证空串哨兵值在根目录 parentId=null 下正确触发唯一键冲突更新（不产生重复行）
      const upserted = await repo.upsertItem({
        teamId,
        parentId: null,
        name: '100% Agent_Bot | Test',
        enabled: false,
        tags: ['updated']
      });
      expect(upserted._id).toBe(first._id);
      expect(upserted.enabled).toBe(false);
      expect(upserted.tags).toEqual(['updated']);
      expect(await repo.countAll()).toBe(1);

      // 3. 验证 caseInsensitiveLike 对 % _ | 通配符的严格转义
      const matched = await repo.searchByName({ teamId, keyword: '100% agent_bot |' });
      expect(matched).toHaveLength(1);
      const unmatched = await repo.searchByName({ teamId, keyword: '100x agent' });
      expect(unmatched).toHaveLength(0);

      // 4. 验证异常回滚不落库且不触发 afterCommit
      const rolledBackSpy = vi.fn();
      await expect(
        runInTransaction(async (tx) => {
          await repo.upsertItem({
            teamId,
            parentId: rootFolderId,
            name: 'Should Rollback',
            enabled: true,
            tx
          });
          tx.afterCommit(rolledBackSpy);
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      expect(rolledBackSpy).not.toHaveBeenCalled();
      expect(await repo.countAll()).toBe(1);

      // 5. 验证 insertChunked 分批写入突破单批参数上限（含首行省略可选键的异构对象场景）
      await repo.bulkInsert(
        Array.from({ length: 7 }, (_, i) =>
          i === 0
            ? {
                _id: createEntityId(),
                team_id: teamId,
                parent_id: rootFolderId,
                name: `Batch-${i}`,
                ancestor_path: ''
              }
            : {
                _id: createEntityId(),
                team_id: teamId,
                parent_id: rootFolderId,
                name: `Batch-${i}`,
                enabled: true,
                tags: ['b'],
                ancestor_path: ''
              }
        )
      );
      expect(await repo.countAll()).toBe(8);
    } finally {
      await harness.close();
    }
  });
});
