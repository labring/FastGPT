import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { searchSqlFullText } from '@fastgpt/service/core/dataset/fullText/sql/store';
import { systemMigrations, type SystemMigrationContext } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { enqueueManualMigration, ensureMigrationStates } from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

vi.mock('@/migration/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  systemMigrationBatchSize: 2
}));

// 仅隔离物理驱动；Mongo 权威引用、断点、查询归一化与旧表清理执行真实代码。
const driver = vi.hoisted(() => ({
  provider: 'pg' as SqlFullTextProvider,
  analyzerVersion: 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1',
  prepare: vi.fn(),
  assertCapability: vi.fn(),
  getMetadata: vi.fn(),
  preflight: vi.fn(),
  fill: vi.fn(),
  search: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => driver.provider
}));
vi.mock('@fastgpt/service/common/vectorDB/fullText/controller', () => ({
  getSqlFullTextAdapter: () => driver
}));

const signatures = {
  pg: 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1',
  oceanbase: 'oceanbase-space-fastgpt-jieba-search-v1',
  seekdb: 'seekdb-space-fastgpt-jieba-search-v1',
  opengauss: 'opengauss-bm25-fastgpt-jieba-search-v1'
};

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
    getFailedRecords: async () => failures,
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, checkpoint: () => checkpoint };
};

describe.each(['pg', 'oceanbase', 'seekdb', 'opengauss'] as const)(
  '%s unified automatic migration and native search',
  (provider) => {
    let metadata: { targetId: string; schemaVersion: number; analyzerVersion: string };

    beforeEach(() => {
      driver.provider = provider;
      driver.analyzerVersion = signatures[provider];
      metadata = {
        targetId: randomUUID(),
        schemaVersion: 1,
        analyzerVersion: driver.analyzerVersion
      };
      driver.prepare.mockReset().mockResolvedValue(metadata);
      driver.getMetadata.mockReset().mockResolvedValue(metadata);
      driver.assertCapability.mockReset().mockResolvedValue(undefined);
      driver.preflight.mockReset().mockResolvedValue([]);
      driver.fill.mockReset().mockResolvedValue([]);
      driver.search.mockReset().mockResolvedValue([]);
    });

    it('prepares, preflights, backfills, validates, retains legacy Mongo rows and cuts over reads to native SQL search', async () => {
      const teamId = new Types.ObjectId().toString();
      const datasetId = new Types.ObjectId().toString();
      const collectionId = new Types.ObjectId().toString();
      const doc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '查询内容', type: 'custom' }]
      });
      await MongoDatasetDataText.create({
        teamId,
        datasetId,
        collectionId,
        dataId: doc._id,
        fullTextToken: '查询 内容'
      });

      const queryProps = {
        teamId,
        datasetIds: [datasetId],
        query: '内容',
        limit: 10,
        forbidCollectionIdList: []
      };
      // 迁移完成前，读取保持在旧 Mongo $text 路径，不触发未回填的 SQL 索引查询。
      expect(await getFullTextStore().search(queryProps)).toEqual([
        { dataId: String(doc._id), collectionId, score: expect.any(Number) }
      ]);
      expect(driver.search).not.toHaveBeenCalled();

      const state = createContext();
      const result = await migrateSqlFullTextMigration(state.context);
      expect(result).toEqual({
        applicable: true,
        provider,
        analyzerVersion: signatures[provider],
        targetId: metadata.targetId,
        prechecked: 1,
        scanned: 1,
        validated: 1
      });
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
      expect(driver.prepare).toHaveBeenCalledOnce();
      expect(driver.preflight).toHaveBeenCalledWith([
        { vectorId: '1', teamId, datasetId, collectionId, text: '查询内容' }
      ]);
      expect(driver.fill).toHaveBeenCalledWith(
        [{ vectorId: '1', teamId, datasetId, collectionId, text: '查询内容' }],
        false
      );
      expect(driver.fill).toHaveBeenCalledWith(
        [{ vectorId: '1', teamId, datasetId, collectionId, text: '查询内容' }],
        true
      );
      expect(driver.preflight.mock.invocationCallOrder[0]).toBeLessThan(
        driver.fill.mock.invocationCallOrder[0]
      );
      expect(state.checkpoint()).toMatchObject({
        provider,
        targetId: metadata.targetId,
        analyzerVersion: signatures[provider],
        stage: 'validation'
      });

      driver.search.mockResolvedValue([
        { vectorId: '1', collectionId, score: 2.5 },
        { vectorId: '999', collectionId, score: 1 }
      ]);
      expect(await searchSqlFullText(queryProps)).toEqual([
        { dataId: String(doc._id), collectionId, score: 2.5 }
      ]);
      expect(await getFullTextStore().search(queryProps)).toEqual([
        { dataId: String(doc._id), collectionId, score: 2.5 }
      ]);
      expect(driver.search).toHaveBeenCalledTimes(2);
    });

    it('blocks fill and read cutover when preflight fails, logs original reason and repeats preflight on retry', async () => {
      const teamId = new Types.ObjectId();
      const datasetId = new Types.ObjectId();
      const collectionId = new Types.ObjectId();
      const doc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '待迁移', type: 'custom' }]
      });
      await MongoDatasetDataText.create({
        teamId,
        datasetId,
        collectionId,
        dataId: doc._id,
        fullTextToken: '待 迁移'
      });

      const state = createContext();
      driver.preflight.mockResolvedValue(['1']);
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(driver.fill).not.toHaveBeenCalled();
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
      expect(state.checkpoint()).toMatchObject({ lastId: null, scanned: 0, validated: 0 });
      expect(await state.context.getFailedRecords()).toMatchObject([
        {
          stageKey: 'preflight',
          data: {
            id: String(doc._id)
          },
          reason: {
            message: expect.stringContaining(
              'Active vector row is missing, has wrong ownership, or has conflicting full text'
            )
          }
        }
      ]);
      expect(state.context.logger.warn).toHaveBeenCalledWith(
        'SQL full-text migration record validation failed',
        expect.objectContaining({
          stageKey: 'preflight',
          id: String(doc._id)
        })
      );

      driver.preflight.mockClear().mockResolvedValue([]);
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        prechecked: 1,
        scanned: 1,
        validated: 1
      });
      // 先重试原错误，再从起点检查完整范围，验收通过后切换读取并保留旧表数据。
      expect(driver.preflight).toHaveBeenCalledTimes(2);
      expect(await state.context.getFailedRecords()).toEqual([]);
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
    });

    it('propagates unexpected database errors immediately instead of recording them as dirty records', async () => {
      const doc = await MongoDatasetData.create({
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '连接中断测试', type: 'custom' }]
      });
      const state = createContext();
      driver.preflight.mockRejectedValueOnce(new Error('ECONNRESET database connection lost'));
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow(
        'ECONNRESET database connection lost'
      );
      expect(await state.context.getFailedRecords()).toEqual([]);
      expect(state.context.logger.warn).not.toHaveBeenCalled();
      expect(doc._id).toBeDefined();
    });

    it('rejects resuming a checkpoint bound to a different physical target', async () => {
      const state = createContext();
      driver.preflight.mockResolvedValue(['1']);
      await MongoDatasetData.create({
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '待迁移', type: 'custom' }]
      });
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');

      driver.prepare.mockResolvedValue({
        targetId: randomUUID(),
        schemaVersion: 1,
        analyzerVersion: signatures[provider]
      });
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow(
        'another SQL target or analyzer version'
      );
    });

    it('stays waiting on Mongo fallback until manually enqueued after legacy writers drain', async () => {
      const teamId = new Types.ObjectId().toString();
      const datasetId = new Types.ObjectId().toString();
      const collectionId = new Types.ObjectId().toString();
      const doc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '滚动升级期间写入', type: 'custom' }]
      });
      await MongoDatasetDataText.create({
        teamId,
        datasetId,
        collectionId,
        dataId: doc._id,
        fullTextToken: '滚动 升级 期间 写入'
      });

      const migrations = systemMigrations.filter(
        (item) => item.id === '20261110_migrate_sql_fulltext'
      );
      const runner = createSystemMigrationRunner({ migrations });
      try {
        await ensureMigrationStates(migrations);
        await runner.tick();
        expect(
          await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
        ).toMatchObject({ status: 'waiting' });
        expect(driver.prepare).not.toHaveBeenCalled();
        expect(
          await getFullTextStore().search({
            teamId,
            datasetIds: [datasetId],
            query: '升级',
            limit: 10,
            forbidCollectionIdList: []
          })
        ).toEqual([{ dataId: String(doc._id), collectionId, score: expect.any(Number) }]);
        expect(driver.search).not.toHaveBeenCalled();

        expect(await enqueueManualMigration('20261110_migrate_sql_fulltext')).toBe(true);
        await runner.tick();
        expect(
          await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
        ).toMatchObject({ status: 'succeeded' });
        driver.search.mockResolvedValue([{ vectorId: '1', collectionId, score: 3.1 }]);
        expect(
          await getFullTextStore().search({
            teamId,
            datasetIds: [datasetId],
            query: '升级',
            limit: 10,
            forbidCollectionIdList: []
          })
        ).toEqual([{ dataId: String(doc._id), collectionId, score: 3.1 }]);
      } finally {
        runner.stop();
      }
    });

    it('re-validates behind a resumed validation cursor and refills rows reset to NULL before cutover', async () => {
      const teamId = new Types.ObjectId().toString();
      const datasetId = new Types.ObjectId().toString();
      const collectionId = new Types.ObjectId().toString();
      const docs = [];
      for (let i = 1; i <= 3; i++) {
        docs.push(
          await MongoDatasetData.create({
            teamId,
            datasetId,
            collectionId,
            tmbId: new Types.ObjectId(),
            synonymVersion: 0,
            indexes: [{ dataId: String(i), text: `验收断点记录 ${i}`, type: 'custom' }]
          })
        );
      }

      const nullVectorIds = new Set<string>(['1', '2', '3']);
      driver.fill.mockImplementation(
        async (rows: { vectorId: string }[], validateOnly?: boolean) => {
          if (!validateOnly) {
            for (const row of rows) {
              nullVectorIds.delete(row.vectorId);
            }
          }
          return rows.filter((row) => nullVectorIds.has(row.vectorId)).map((row) => row.vectorId);
        }
      );

      const state = createContext();
      const abortFirstValidation = new AbortController();
      state.context.signal = abortFirstValidation.signal;
      const baseSave = state.context.saveCheckpoint.getMockImplementation()!;
      state.context.saveCheckpoint.mockImplementation(async (value) => {
        await baseSave(value);
        if (value.stage === 'validation' && value.validated === 2) {
          abortFirstValidation.abort();
        }
      });

      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow();
      expect(state.checkpoint()).toMatchObject({
        stage: 'validation',
        validationLastId: String(docs[1]._id),
        validated: 2
      });

      // 模拟首批已验收记录在中断恢复前被置回 NULL。
      nullVectorIds.add('1');
      state.context.signal = new AbortController().signal;
      state.context.saveCheckpoint.mockImplementation(baseSave);

      const resumedResult = await migrateSqlFullTextMigration(state.context);
      expect(resumedResult).toMatchObject({
        prechecked: 3,
        scanned: 3,
        validated: 3
      });
      expect(nullVectorIds.size).toBe(0);
    });

    it('records invalid historical vector IDs and illegal text inputs in failedRecords without halting batch scan', async () => {
      const teamId = new Types.ObjectId();
      const datasetId = new Types.ObjectId();
      const collectionId = new Types.ObjectId();
      const badVectorDoc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: 'invalid-vector-id', text: '正常文本', type: 'custom' }]
      });
      const badTextDoc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '2', text: '包含空字符\0的脏数据', type: 'custom' }]
      });
      const healthyDoc = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '3', text: '健康可迁移数据', type: 'custom' }]
      });

      const state = createContext();
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(driver.preflight).toHaveBeenCalledWith([
        {
          vectorId: '3',
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(collectionId),
          text: '健康可迁移数据'
        }
      ]);
      expect(await state.context.getFailedRecords()).toEqual([
        {
          stageKey: 'preflight',
          data: { id: String(badVectorDoc._id) },
          reason: { message: 'Full-text vector ID must be a positive signed bigint' }
        },
        {
          stageKey: 'preflight',
          data: { id: String(badTextDoc._id) },
          reason: { message: 'Full-text input exceeds 1 MiB or contains a null character' }
        }
      ]);
      expect(healthyDoc._id).toBeDefined();
    });
  }
);
