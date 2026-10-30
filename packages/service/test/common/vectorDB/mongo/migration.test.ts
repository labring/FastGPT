import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { DatasetDataEmbeddingMongoSchema } from '@fastgpt/service/common/vectorDB/mongo/schema';
import {
  assertPgEmbeddingCopy,
  mapPgEmbeddingRow,
  migratePgEmbeddings,
  parsePgEmbeddingMigrationOptions
} from '@fastgpt/service/common/vectorDB/mongo/migration';

vi.mock('@fastgpt/service/common/vectorDB/mongo/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/vectorDB/mongo/schema')>();
  const { connectionMongo } = await import('@fastgpt/service/common/mongo');
  return {
    ...actual,
    MongoDatasetDataEmbedding: connectionMongo.model(
      'PgMongoEmbeddingMigrationTest',
      actual.DatasetDataEmbeddingMongoSchema,
      'pg_mongo_embedding_migration_test'
    )
  };
});
const target = connectionMongo.model(
  'PgMongoEmbeddingMigrationTest',
  DatasetDataEmbeddingMongoSchema,
  'pg_mongo_embedding_migration_test'
);
const vector = [1, ...Array(1535).fill(0)];
const row = (id = '414') => ({
  id,
  teamId: 'team',
  datasetId: 'dataset',
  collectionId: 'collection',
  vector: JSON.stringify(vector),
  createTime: new Date('2026-10-30T01:00:00Z'),
  text: null
});
const source = (rows: ReturnType<typeof row>[]) => {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('count(*)'))
      return { rows: [{ total: String(rows.length), timezone: 'UTC' }] };
    if (sql.includes('information_schema')) return { rows: [{ has_text: true }] };
    if (sql.includes('SELECT id::text'))
      return {
        rows: rows
          .filter((r) => BigInt(r.id) > BigInt(String(values?.[0])))
          .slice(0, Number(values?.[1]))
      };
    return { rows: [] };
  });
  return { client: { query } as unknown as Client, query };
};

describe('PG embedding migration mapping and options', () => {
  it('defaults to dry-run, accepts explicit execution and validates batch bounds', () => {
    expect(parsePgEmbeddingMigrationOptions([])).toEqual({ execute: false, batchSize: 100 });
    expect(parsePgEmbeddingMigrationOptions(['--', '--execute', '--batch-size=2'])).toEqual({
      execute: true,
      batchSize: 2
    });
    expect(parsePgEmbeddingMigrationOptions(['--execute', '--dry-run']).execute).toBe(false);
    for (const arg of ['--unknown', '--batch-size=0', '--batch-size=1001', '--batch-size=no'])
      expect(() => parsePgEmbeddingMigrationOptions([arg])).toThrow();
  });

  it('preserves legacy IDs, source timestamps and full precision vectors', () => {
    const mapped = mapPgEmbeddingRow(row());
    expect(mapped).toEqual({
      _id: '414',
      teamId: 'team',
      datasetId: 'dataset',
      collectionId: 'collection',
      vector,
      createTime: new Date('2026-10-30T01:00:00Z'),
      text: null
    });
    expect(() => mapPgEmbeddingRow({ ...row(), vector: '[1]' })).toThrow();
    expect(() => mapPgEmbeddingRow({ ...row(), createTime: null })).toThrow();
    expect(() =>
      assertPgEmbeddingCopy({ source: mapped, target: { ...mapped, teamId: 'other' } })
    ).toThrow('conflicts');
    expect(() =>
      assertPgEmbeddingCopy({
        source: mapped,
        target: { ...mapped, vector: [-1, ...Array(1535).fill(0)] }
      })
    ).toThrow('conflicts');
  });
});

describe('migratePgEmbeddings', () => {
  it('validates dry-runs without target writes or source write locks', async () => {
    const pg = source([row()]);
    const result = await migratePgEmbeddings({ source: pg.client, execute: false, batchSize: 1 });
    expect(result.scanned).toBe(1);
    expect(await target.countDocuments()).toBe(0);
    expect(pg.query.mock.calls.some(([q]) => q.includes('LOCK TABLE'))).toBe(false);
  });

  it('copies stable pages, verifies every value and replays without duplicate inserts', async () => {
    const rows = [row('414'), row('415')];
    const progress = vi.fn();
    const pg = source(rows);
    const result = await migratePgEmbeddings({
      source: pg.client,
      execute: true,
      batchSize: 1,
      onProgress: progress
    });
    expect(result).toMatchObject({ total: 2, scanned: 2, inserted: 2, targetCount: 2 });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(pg.query).toHaveBeenCalledWith('LOCK TABLE public.modeldata IN SHARE MODE');
    const retry = await migratePgEmbeddings({
      source: source(rows).client,
      execute: true,
      batchSize: 1
    });
    expect(retry.inserted).toBe(0);
    expect(await target.countDocuments()).toBe(2);
  });

  it('keeps bigint IDs numeric while paging and preserves IDs beyond JavaScript safe integers', async () => {
    const rows = ['9', '10', '100', '9007199254740993', '9007199254740994'].map((id) => row(id));
    const pg = source(rows);
    const result = await migratePgEmbeddings({ source: pg.client, execute: true, batchSize: 2 });
    expect(result.targetCount).toBe(5);
    expect(await target.findById('9007199254740994').lean()).not.toBeNull();
    const pageQueries = pg.query.mock.calls.filter(([sql]) => sql.includes('SELECT id::text'));
    // SELECT 的 id::text 输出别名会令 ORDER BY id 按字符串排序，必须使用源 bigint 列。
    expect(pageQueries.every(([sql]) => sql.includes('ORDER BY modeldata.id LIMIT'))).toBe(true);
  });

  it('rejects existing conflicting IDs without overwriting them', async () => {
    const existing = { ...mapPgEmbeddingRow(row()), teamId: 'other' };
    await target.create(existing);
    const pg = source([row()]);
    await expect(
      migratePgEmbeddings({ source: pg.client, execute: true, batchSize: 10 })
    ).rejects.toThrow('conflicts');
    expect((await target.findById('414').lean())?.teamId).toBe('other');
    expect(pg.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('validates the whole batch before writes and safely resumes committed earlier batches', async () => {
    const rows = [row('414'), { ...row('415'), vector: '[1]' }];
    await expect(
      migratePgEmbeddings({ source: source(rows).client, execute: true, batchSize: 2 })
    ).rejects.toThrow();
    expect(await target.countDocuments()).toBe(0);
    await expect(
      migratePgEmbeddings({ source: source(rows).client, execute: true, batchSize: 1 })
    ).rejects.toThrow();
    expect(await target.countDocuments()).toBe(1);
    const result = await migratePgEmbeddings({
      source: source([row('414'), row('415')]).client,
      execute: true,
      batchSize: 1
    });
    expect(result.inserted).toBe(1);
    expect(result.targetCount).toBe(2);
  });

  it('does not declare success while extra migrated IDs remain', async () => {
    await target.create(mapPgEmbeddingRow(row('999')));
    await expect(
      migratePgEmbeddings({ source: source([row()]).client, execute: true, batchSize: 10 })
    ).rejects.toThrow('count differs');
  });
});
