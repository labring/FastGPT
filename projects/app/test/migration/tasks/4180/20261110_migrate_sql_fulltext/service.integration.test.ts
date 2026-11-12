import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, Pool } from 'pg';

// 必须显式指定独立本地实例和测试库，绝不复用 PG_URL 或业务数据库。
const target = vi.hoisted(() => {
  const address = process.env.FASTGPT_PG_FULLTEXT_TEST_URL;
  if (!address) return;
  const url = new URL(address);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/fulltext_test')
  ) {
    throw new Error('Full-text migration tests require an explicit local fulltext_test database');
  }
  return { address, schema: `fulltext_test_${process.pid}_${Date.now()}` };
});
vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => 'pg',
  PG_ADDRESS: target?.address ?? 'mock://pg'
}));
vi.mock('@/migration/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  systemMigrationBatchSize: 2
}));

import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import { toSqlFullTextTokens } from '@fastgpt/service/common/vectorDB/fullText/analyzer';
import {
  fillPgFullText,
  preflightPgFullText,
  searchPgFullText,
  preparePgFullText,
  assertPgFullTextCapability
} from '@fastgpt/service/common/vectorDB/pg/fullText';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { searchSqlFullText } from '@fastgpt/service/core/dataset/fullText/sql/store';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrations } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import {
  ensureMigrationStates,
  getMigrationFailedRecords,
  resetFailedMigration
} from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import { migrateSqlFullTextRecord } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext/service';
import { DatasetDataOperation } from '@/service/core/dataset/data/data';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { mockGetVectors } from '@test/mocks/core/ai/embedding';

/** 仅模拟框架恢复状态，业务读写使用真实隔离的 Mongo 副本集和 PG。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261110_migrate_sql_fulltext',
    runId: randomUUID(),
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, failures: () => failures };
};

describe.skipIf(!target)('PG full-text real migration', () => {
  const teamId = new Types.ObjectId().toString();
  const datasetId = new Types.ObjectId().toString();
  const collectionId = new Types.ObjectId().toString();
  const foreignTeamId = new Types.ObjectId().toString();
  const hiddenCollectionId = new Types.ObjectId().toString();
  const ctrl = new PgVectorCtrl();
  const admin = new Client({ connectionString: target?.address });
  let previousPool: typeof global.pgClient;
  let pool: Pool;
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
  const props = (query: string) => ({
    teamId,
    datasetIds: [datasetId],
    query,
    limit: 10,
    forbidCollectionIdList: [] as string[]
  });

  /** 模拟升级前的旧向量表行写入（不含 fulltext_tokens 列）或升级后的原生写入。 */
  const seed = async (
    text: string,
    options: {
      count?: number;
      teamId?: string;
      collectionId?: string;
      image?: boolean;
      native?: boolean;
    } = {}
  ) => {
    const owner = options.teamId ?? teamId;
    const collection = options.collectionId ?? collectionId;
    const count = options.count ?? 1;
    const insertIds = options.native
      ? (
          await ctrl.insert({
            teamId: owner,
            datasetId,
            collectionId: collection,
            vectors: Array.from({ length: count }, () => vector),
            texts: Array(count).fill(options.image ? '' : text)
          })
        ).insertIds
      : (
          await pool.query<{ id: string }>(
            `INSERT INTO modeldata (vector, team_id, dataset_id, collection_id)
             SELECT $1::vector, $2, $3, $4 FROM generate_series(1, $5::int)
             RETURNING id::text AS id`,
            [`[${vector.join(',')}]`, owner, datasetId, collection, count]
          )
        ).rows.map((row) => row.id);
    const data = await MongoDatasetData.create({
      teamId: owner,
      datasetId,
      collectionId: collection,
      tmbId: new Types.ObjectId(),
      q: text,
      a: '',
      synonymVersion: 0,
      indexes: insertIds.map((dataId) => ({
        dataId,
        text,
        type: options.image
          ? DatasetDataIndexTypeEnum.imageEmbedding
          : DatasetDataIndexTypeEnum.custom
      }))
    });
    if (!options.native) {
      await MongoDatasetDataText.create({
        dataId: data._id,
        teamId: owner,
        datasetId,
        collectionId: collection,
        fullTextToken: text
      });
    }
    return { id: String(data._id), insertIds };
  };

  const snapshot = async () =>
    (
      await pool.query(
        'SELECT id::text, vector::text, team_id, dataset_id, collection_id, createtime FROM modeldata ORDER BY id'
      )
    ).rows;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${target!.schema}`);
    pool = new Pool({
      connectionString: target!.address,
      options: `-csearch_path=${target!.schema},public`,
      max: 4
    });
    previousPool = global.pgClient;
    global.pgClient = pool;
  });
  beforeEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS modeldata CASCADE;
      DROP TABLE IF EXISTS fastgpt_fulltext_metadata;
      CREATE TABLE modeldata (id bigserial PRIMARY KEY, vector vector(1536) NOT NULL,
        team_id varchar(50) NOT NULL, dataset_id varchar(50) NOT NULL,
        collection_id varchar(50) NOT NULL, createtime timestamp DEFAULT now())`);
  });
  afterAll(async () => {
    global.pgClient = previousPool;
    await pool?.end();
    await admin.query(`DROP SCHEMA ${target!.schema} CASCADE`);
    await admin.end();
  });

  it('runs the registered automatic migration through the real Runner, preserves originals and cleans legacy Mongo text rows', async () => {
    const cases = [
      ['南京市长江大桥通行指南', '长江大桥'],
      ['FastGPT API authentication token', 'authentication'],
      ['GPU 显存不足 OOM 排查', '显存'],
      ['退款到账时间说明', '退款']
    ];
    const fixtures = [];
    for (const [text, query] of cases) fixtures.push({ ...(await seed(text)), query });
    const original = await snapshot();
    const source = await MongoDatasetData.find().sort({ _id: 1 }).lean();
    expect(await MongoDatasetDataText.countDocuments()).toBe(4);

    const migrations = systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext');
    const runner = createSystemMigrationRunner({ migrations });
    try {
      await ensureMigrationStates(migrations);
      await runner.tick();
      const state = await MongoSystemMigrationState.findById(
        '20261110_migrate_sql_fulltext'
      ).lean();
      expect(state).toMatchObject({
        status: 'succeeded',
        result: {
          applicable: true,
          provider: 'pg',
          prechecked: 4,
          scanned: 4,
          validated: 4,
          deletedLegacyCount: 4
        }
      });
      for (const fixture of fixtures) {
        expect((await getFullTextStore().search(props(fixture.query)))[0]?.dataId).toBe(fixture.id);
      }
      expect(await snapshot()).toEqual(original);
      expect(await MongoDatasetData.find().sort({ _id: 1 }).lean()).toEqual(source);
      expect(await MongoDatasetDataText.countDocuments()).toBe(0);
    } finally {
      runner.stop();
    }
  });

  it('fails the real Runner on an active missing vector without backfilling or cleaning legacy rows until repaired', async () => {
    const fixture = await seed('缺失向量 missingvectorproof');
    await pool.query('DELETE FROM modeldata WHERE id=$1', [fixture.insertIds[0]]);
    const healthy = await seed('正常向量 healthyvectorproof');
    const original = await MongoDatasetData.find().sort({ _id: 1 }).lean();
    const oldText = await MongoDatasetDataText.find().sort({ _id: 1 }).lean();
    const migrations = systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext');
    const runner = createSystemMigrationRunner({ migrations });
    try {
      await ensureMigrationStates(migrations);
      await runner.tick();
      expect(
        await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
      ).toMatchObject({ status: 'failed' });
      expect(await getMigrationFailedRecords('20261110_migrate_sql_fulltext')).toMatchObject([
        { stageKey: 'preflight', data: { id: fixture.id } }
      ]);
      expect(await MongoDatasetData.find().sort({ _id: 1 }).lean()).toEqual(original);
      expect(await MongoDatasetDataText.find().sort({ _id: 1 }).lean()).toEqual(oldText);
      expect(
        (
          await pool.query('SELECT fulltext_tokens AS text FROM modeldata WHERE id=$1', [
            healthy.insertIds[0]
          ])
        ).rows[0].text
      ).toBeNull();
      expect((await snapshot()).map((row) => row.id)).toEqual(healthy.insertIds);

      // 模拟管理员修复缺失向量后从保留断点重试。
      await pool.query(
        'INSERT INTO modeldata(id,vector,team_id,dataset_id,collection_id) VALUES($1,$2,$3,$4,$5)',
        [fixture.insertIds[0], `[${vector.join(',')}]`, teamId, datasetId, collectionId]
      );
      expect(await resetFailedMigration('20261110_migrate_sql_fulltext')).toBe(true);
      await runner.tick();
      expect(
        await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
      ).toMatchObject({
        status: 'succeeded',
        result: { prechecked: 2, scanned: 2, validated: 2, deletedLegacyCount: 2 }
      });
      expect(await getMigrationFailedRecords('20261110_migrate_sql_fulltext')).toEqual([]);
      expect(
        (
          await pool.query('SELECT fulltext_tokens AS text FROM modeldata WHERE id=$1', [
            fixture.insertIds[0]
          ])
        ).rows[0].text
      ).toBe(await toSqlFullTextTokens('缺失向量 missingvectorproof'));
      expect(await MongoDatasetData.find().sort({ _id: 1 }).lean()).toEqual(original);
      expect(await MongoDatasetDataText.countDocuments()).toBe(0);
    } finally {
      runner.stop();
    }
  });

  it('finds late preflight failures before any fill and rechecks earlier rows on retry', async () => {
    const fixtures = [];
    for (let i = 0; i < 5; i++) fixtures.push(await seed(`全量预检 preflight ${i}`));
    const state = createContext();
    await pool.query('UPDATE modeldata SET team_id=$1 WHERE id=$2', [
      foreignTeamId,
      fixtures[4].insertIds[0]
    ]);
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(state.failures()).toMatchObject([
      { stageKey: 'preflight', data: { id: fixtures[4].id } }
    ]);
    expect(state.context.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'preflight', current: 5 })
    );
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NOT NULL'
        )
      ).rows[0].n
    ).toBe(0);
    expect(await MongoDatasetDataText.countDocuments()).toBe(5);
    expect(state.context.saveCheckpoint).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanned: 0, lastId: null })
    );
    await pool.query('UPDATE modeldata SET team_id=$1 WHERE id=$2', [
      teamId,
      fixtures[4].insertIds[0]
    ]);
    await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
      'conflict',
      fixtures[0].insertIds[0]
    ]);
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(state.failures()).toMatchObject([
      { stageKey: 'preflight', data: { id: fixtures[0].id } }
    ]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NOT NULL'
        )
      ).rows[0].n
    ).toBe(1);
    await pool.query('UPDATE modeldata SET fulltext_tokens=NULL WHERE id=$1', [
      fixtures[0].insertIds[0]
    ]);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
      prechecked: 5,
      scanned: 5,
      validated: 5,
      deletedLegacyCount: 5
    });
    expect(await MongoDatasetDataText.countDocuments()).toBe(0);
  });

  it('cancels read-only preflight without filling and starts preflight from the beginning on resume', async () => {
    const fixtures = [];
    for (let i = 0; i < 5; i++) fixtures.push(await seed(`预检取消 preflightcancel ${i}`));
    const state = createContext();
    const controller = new AbortController();
    state.context.signal = controller.signal;
    state.context.reportProgress.mockImplementation(async ({ key, current }) => {
      if (key === 'preflight' && current === 2) controller.abort();
    });
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow();
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NOT NULL'
        )
      ).rows[0].n
    ).toBe(0);
    expect(await MongoDatasetDataText.countDocuments()).toBe(5);
    state.context.signal = new AbortController().signal;
    state.context.runId = randomUUID();
    state.context.reportProgress.mockReset();
    await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
      'conflict',
      fixtures[0].insertIds[0]
    ]);
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(state.failures()).toMatchObject([
      { stageKey: 'preflight', data: { id: fixtures[0].id } }
    ]);
    await pool.query('UPDATE modeldata SET fulltext_tokens=NULL WHERE id=$1', [
      fixtures[0].insertIds[0]
    ]);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
      prechecked: 5,
      scanned: 5,
      validated: 5,
      deletedLegacyCount: 5
    });
  });

  it('checks NULL, matching, conflicting, missing and foreign-owned target rows without writes', async () => {
    const fixtures = [];
    for (let i = 0; i < 5; i++) fixtures.push(await seed(`check ${i}`));
    await preparePgFullText();
    await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
      await toSqlFullTextTokens('check 1'),
      fixtures[1].insertIds[0]
    ]);
    await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
      'conflict',
      fixtures[2].insertIds[0]
    ]);
    await pool.query('DELETE FROM modeldata WHERE id=$1', [fixtures[3].insertIds[0]]);
    await pool.query('UPDATE modeldata SET collection_id=$1 WHERE id=$2', [
      hiddenCollectionId,
      fixtures[4].insertIds[0]
    ]);
    const before = await pool.query(
      'SELECT id::text, fulltext_tokens, team_id, dataset_id, collection_id FROM modeldata ORDER BY id'
    );
    expect(
      await preflightPgFullText(
        fixtures.map((fixture, i) => ({
          vectorId: fixture.insertIds[0],
          teamId,
          datasetId,
          collectionId,
          text: `check ${i}`
        }))
      )
    ).toEqual(fixtures.slice(2).map(({ insertIds }) => insertIds[0]));
    expect(
      (
        await pool.query(
          'SELECT id::text, fulltext_tokens, team_id, dataset_id, collection_id FROM modeldata ORDER BY id'
        )
      ).rows
    ).toEqual(before.rows);
  });

  it('replays a batch committed before checkpoint failure without re-embedding', async () => {
    for (let i = 0; i < 5; i++) await seed(`历史数据 recovery ${i}`);
    const original = await snapshot();
    const state = createContext();
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint.mockImplementationOnce(save).mockImplementationOnce(async () => {
      throw new Error('simulated checkpoint crash');
    });
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('checkpoint crash');
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NOT NULL'
        )
      ).rows[0].n
    ).toBe(2);
    state.context.saveCheckpoint.mockImplementation(save);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
      scanned: 5,
      validated: 5,
      deletedLegacyCount: 5
    });
    expect(await snapshot()).toEqual(original);
    const order = state.context.reportFailedRecords.mock.invocationCallOrder;
    expect(order[0]).toBeLessThan(state.context.saveCheckpoint.mock.invocationCallOrder[1]);
  });

  it('retains a scan failure behind the cursor through preflight failure and recovery', async () => {
    const missing = await seed('missing active row');
    await seed('correct row');
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'scan' && status === 'running')
        await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
          'conflicting',
          missing.insertIds[0]
        ]);
    });
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(state.failures()).toMatchObject([{ stageKey: 'scan', data: { id: missing.id } }]);
    state.context.reportProgress.mockReset();
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(
      state
        .failures()
        .map(({ stageKey }) => stageKey)
        .sort()
    ).toEqual(['preflight', 'scan']);
    await pool.query('UPDATE modeldata SET fulltext_tokens=NULL WHERE id=$1', [
      missing.insertIds[0]
    ]);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({ validated: 2 });
    expect(state.failures()).toEqual([]);
    await pool.query('DELETE FROM modeldata WHERE id=$1', [missing.insertIds[0]]);
    await expect(migrateSqlFullTextRecord(missing.id)).rejects.toThrow('Active vector');
    expect((await pool.query('SELECT count(*)::int AS n FROM modeldata')).rows[0].n).toBe(1);
  });

  it('stops on cancellation after a committed batch and resumes with a new execution identity', async () => {
    for (let i = 0; i < 5; i++) await seed(`取消恢复 cancellation ${i}`);
    const state = createContext();
    const controller = new AbortController();
    state.context.signal = controller.signal;
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint.mockImplementation(async (checkpoint) => {
      await save(checkpoint);
      if (checkpoint.scanned === 2) controller.abort();
    });
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow();
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NOT NULL'
        )
      ).rows[0].n
    ).toBe(2);
    expect(await MongoDatasetDataText.countDocuments()).toBe(5);
    state.context.signal = new AbortController().signal;
    state.context.runId = randomUUID();
    state.context.saveCheckpoint.mockImplementation(save);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
      scanned: 5,
      validated: 5,
      deletedLegacyCount: 5
    });
    expect(await MongoDatasetDataText.countDocuments()).toBe(0);
  });

  it('retries validation failures behind the validation cursor instead of stopping in the scan stage', async () => {
    const fixture = await seed('校验恢复 validationproof');
    await seed('其他记录 otherrecord');
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      if (key === 'validation' && status === 'running')
        await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
          'conflict',
          fixture.insertIds[0]
        ]);
    });
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    expect(state.failures()).toEqual([
      expect.objectContaining({ stageKey: 'validation', data: { id: fixture.id } })
    ]);
    expect(await MongoDatasetDataText.countDocuments()).toBe(2);
    state.context.reportProgress.mockReset();
    await pool.query('UPDATE modeldata SET fulltext_tokens=$1 WHERE id=$2', [
      await toSqlFullTextTokens('校验恢复 validationproof'),
      fixture.insertIds[0]
    ]);
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
      validated: 2,
      deletedLegacyCount: 2
    });
    expect(state.failures()).toEqual([]);
    expect(await MongoDatasetDataText.countDocuments()).toBe(0);
  });

  it('handles concurrent replacement, deletion and post-boundary inserts without resurrecting old IDs', async () => {
    const replaced = await seed('旧版 outdated');
    const deleted = await seed('删除 deleted');
    await seed('保留 retained');
    const state = createContext();
    let changed = false;
    const save = state.context.saveCheckpoint.getMockImplementation()!;
    state.context.saveCheckpoint.mockImplementation(async (checkpoint) => {
      await save(checkpoint);
      if (changed || checkpoint.scanned !== 2) return;
      changed = true;
      const next = await ctrl.insert({
        teamId,
        datasetId,
        collectionId,
        vectors: [vector],
        texts: ['新版 replacement']
      });
      await MongoDatasetData.updateOne(
        { _id: replaced.id },
        {
          $set: {
            indexes: [
              {
                dataId: next.insertIds[0],
                text: '新版 replacement',
                type: DatasetDataIndexTypeEnum.custom
              }
            ]
          }
        }
      );
      await pool.query('DELETE FROM modeldata WHERE id = ANY($1::bigint[])', [
        [...replaced.insertIds, ...deleted.insertIds]
      ]);
      await MongoDatasetData.deleteOne({ _id: deleted.id });
      await seed('新写入 incremental', { native: true });
    });
    expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({ validated: 3 });
    expect((await searchSqlFullText(props('replacement')))[0]?.dataId).toBe(replaced.id);
    expect(await searchSqlFullText(props('outdated'))).toEqual([]);
    expect((await searchSqlFullText(props('incremental'))).length).toBe(1);
    expect(
      (
        await pool.query('SELECT id FROM modeldata WHERE id=ANY($1::bigint[])', [
          [...replaced.insertIds, ...deleted.insertIds]
        ])
      ).rows
    ).toEqual([]);
  });

  it('filters tenant/collection before Top-K, deduplicates business IDs and excludes image keys and orphans', async () => {
    const wanted = await seed('南京长江大桥 alpha', { count: 8 });
    const second = await seed('南京长江大桥 beta');
    await seed('南京长江大桥 alpha alpha alpha', { teamId: foreignTeamId });
    await seed('南京长江大桥 alpha alpha', { collectionId: hiddenCollectionId });
    const image = await seed('private_image_secret_key', { image: true });
    const oldOrphan = (
      await pool.query<{ id: string }>(
        'INSERT INTO modeldata (vector, team_id, dataset_id, collection_id) VALUES ($1::vector, $2, $3, $4) RETURNING id::text AS id',
        [`[${vector.join(',')}]`, teamId, datasetId, collectionId]
      )
    ).rows[0].id;
    const state = createContext();
    await migrateSqlFullTextMigration(state.context);
    expect(
      (await pool.query('SELECT fulltext_tokens AS text FROM modeldata WHERE id=$1', [oldOrphan]))
        .rows[0].text
    ).toBeNull();
    await ctrl.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: [vector],
      texts: ['南京长江大桥 orphan orphan']
    });
    const matches = await searchSqlFullText({
      ...props('长江大桥'),
      limit: 2,
      filterCollectionIdList: [collectionId, hiddenCollectionId],
      forbidCollectionIdList: [hiddenCollectionId]
    });
    expect(new Set(matches.map(({ dataId }) => dataId))).toEqual(new Set([wanted.id, second.id]));
    expect(await searchSqlFullText(props('private_image_secret_key'))).toEqual([]);
    expect(
      (
        await pool.query('SELECT fulltext_tokens AS text FROM modeldata WHERE id=$1', [
          image.insertIds[0]
        ])
      ).rows[0].text
    ).toBe('');
    expect(await searchPgFullText({ ...props('大桥'), filterCollectionIdList: [] })).toEqual([]);
    const dense = await ctrl.embRecall({ ...props(''), vector, limit: 2 });
    expect(dense.results.length).toBe(2);
    expect(dense.results.every(({ score }) => score === 1)).toBe(true);
  });

  it('keeps rolled-back Mongo data invisible even when SQL full text was written', async () => {
    await preparePgFullText();
    let vectorId = '';
    await expect(
      mongoSessionRun(async (session) => {
        const inserted = await ctrl.insert({
          teamId,
          datasetId,
          collectionId,
          vectors: [vector],
          texts: ['事务 rollback invisible']
        });
        vectorId = inserted.insertIds[0];
        await MongoDatasetData.create(
          [
            {
              teamId,
              datasetId,
              collectionId,
              tmbId: new Types.ObjectId(),
              q: 'rollback invisible',
              synonymVersion: 0,
              indexes: [
                {
                  dataId: vectorId,
                  text: '事务 rollback invisible',
                  type: DatasetDataIndexTypeEnum.custom
                }
              ]
            }
          ],
          { session }
        );
        throw new Error('abort Mongo transaction');
      })
    ).rejects.toThrow('abort Mongo');
    expect(await MongoDatasetData.countDocuments()).toBe(0);
    expect((await searchPgFullText(props('invisible'))).map(({ vectorId }) => vectorId)).toContain(
      vectorId
    );
    expect(await searchSqlFullText(props('invisible'))).toEqual([]);
  });

  it('rejects wrong ownership, mismatched inputs and changed target checkpoints', async () => {
    const fixture = await seed('安全 boundary');
    await preparePgFullText();
    await expect(
      ctrl.insert({
        teamId,
        datasetId,
        collectionId,
        vectors: [vector],
        texts: []
      })
    ).rejects.toThrow('match vector');
    expect(
      await fillPgFullText([
        {
          vectorId: fixture.insertIds[0],
          teamId: foreignTeamId,
          datasetId,
          collectionId,
          text: 'must not write'
        }
      ])
    ).toEqual(fixture.insertIds);
    expect(
      (
        await pool.query('SELECT fulltext_tokens AS text FROM modeldata WHERE id=$1', [
          fixture.insertIds[0]
        ])
      ).rows[0].text
    ).toBeNull();

    await pool.query('DELETE FROM modeldata WHERE id=$1', [fixture.insertIds[0]]);
    const state = createContext();
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
    await pool.query('UPDATE fastgpt_fulltext_metadata SET target_id=$1', [randomUUID()]);
    await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow(
      'another SQL target or analyzer version'
    );
  });

  it('detects a wrong same-name index and never treats it as successful preparation', async () => {
    await preparePgFullText();
    await pool.query('DROP INDEX modeldata_fulltext');
    await pool.query('CREATE INDEX modeldata_fulltext ON modeldata (team_id)');
    await expect(assertPgFullTextCapability()).rejects.toThrow('supported configuration');
    await expect(preparePgFullText()).rejects.toThrow('supported configuration');
  });

  it('writes, updates and deletes through the real business path using single-table SQL full-text', async () => {
    await ctrl.init();
    const model = {
      modelId: '68ad85a7463006c963799a05',
      model: 'text-embedding-3-small',
      name: 'text-embedding-3-small',
      provider: 'openai',
      scope: 'system',
      isActive: true,
      type: 'embedding',
      config: { defaultToken: 512, maxToken: 512, weight: 100 }
    } as EmbeddingModelDataType;
    const operation = new DatasetDataOperation(model);
    const created = await operation.create({
      teamId,
      datasetId,
      collectionId,
      tmbId: new Types.ObjectId().toString(),
      q: "业务创建 createproof O'Reilly 🦆",
      a: '',
      embeddingModel: model
    });
    expect(await MongoDatasetDataText.countDocuments()).toBe(0);
    expect((await searchSqlFullText(props('createproof')))[0]?.dataId).toBe(created.insertId);
    expect((await getFullTextStore().search(props('createproof')))[0]?.dataId).toBe(
      created.insertId
    );
    const first = await MongoDatasetData.findById(created.insertId).lean();
    await operation.updateByIndexes({
      dataId: created.insertId,
      q: '业务更新 updateproof',
      a: '',
      indexes: [],
      model
    });
    expect((await searchSqlFullText(props('updateproof')))[0]?.dataId).toBe(created.insertId);
    expect(await searchSqlFullText(props('createproof'))).toEqual([]);
    expect(
      (
        await pool.query('SELECT id FROM modeldata WHERE id=ANY($1::bigint[])', [
          first!.indexes.map((i) => i.dataId)
        ])
      ).rows
    ).toEqual([]);
    const current = (await MongoDatasetData.findById(created.insertId).lean())!;
    await operation.delete({ ...current, id: String(current._id) });
    expect(await searchSqlFullText(props('updateproof'))).toEqual([]);
    expect(await MongoDatasetData.countDocuments()).toBe(0);
    expect(await MongoDatasetDataText.countDocuments()).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM modeldata')).rows[0].n).toBe(0);
    const calls = mockGetVectors.mock.calls.length;
    const state = createContext();
    await migrateSqlFullTextMigration(state.context);
    expect(mockGetVectors.mock.calls.length).toBe(calls);
  });

  it.skipIf(!process.env.FASTGPT_FULLTEXT_SNAPSHOT_PATH)(
    'migrates a read-only snapshot of local legacy data, preserves vectors and cleans legacy Mongo text table',
    async () => {
      const snapshotData = mongo.BSON.EJSON.parse(
        readFileSync(process.env.FASTGPT_FULLTEXT_SNAPSHOT_PATH!, 'utf8')
      );
      await MongoDatasetData.collection.insertMany(snapshotData.documents);
      await MongoDatasetDataText.collection.insertMany(snapshotData.textDocs);
      for (const row of snapshotData.vectorRows) {
        await pool.query(
          `INSERT INTO modeldata(id,vector,team_id,dataset_id,collection_id,createtime)
        VALUES($1,$2,$3,$4,$5,$6)`,
          [row.id, row.vector, row.team_id, row.dataset_id, row.collection_id, row.createtime]
        );
      }
      const original = await snapshot();
      const originalDocs = await MongoDatasetData.find().sort({ _id: 1 }).lean();
      const state = createContext();
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        scanned: snapshotData.documents.length,
        validated: snapshotData.documents.length,
        deletedLegacyCount: snapshotData.textDocs.length
      });
      expect(await snapshot()).toEqual(original);
      expect(await MongoDatasetData.find().sort({ _id: 1 }).lean()).toEqual(originalDocs);
      expect(await MongoDatasetDataText.countDocuments()).toBe(0);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM modeldata WHERE id=ANY($1::bigint[]) AND fulltext_tokens IS NULL',
            [originalDocs.flatMap((doc) => doc.indexes.map((index) => index.dataId))]
          )
        ).rows[0].n
      ).toBe(0);

      const samples = originalDocs
        .filter((d) => d.indexes.some((i) => i.type !== DatasetDataIndexTypeEnum.imageEmbedding))
        .slice(0, 20);
      let pgHit10 = 0;
      for (const doc of samples) {
        const query = doc.indexes.find(
          (i) => i.type !== DatasetDataIndexTypeEnum.imageEmbedding
        )!.text;
        const pgHits = await searchSqlFullText({
          ...props(query),
          teamId: String(doc.teamId),
          datasetIds: [String(doc.datasetId)]
        });
        pgHit10 += Number(pgHits.some((hit) => hit.dataId === String(doc._id)));
      }
      console.info('Local snapshot migration evidence', {
        documents: originalDocs.length,
        vectors: original.length,
        queries: samples.length,
        pgSelfHit10: pgHit10
      });
    }
  );
});
