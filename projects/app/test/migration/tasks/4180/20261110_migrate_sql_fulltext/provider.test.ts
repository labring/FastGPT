import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { searchSqlFullText } from '@fastgpt/service/core/dataset/fullText/sql/store';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

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

    it('prepares, preflights, backfills, validates, cleans legacy Mongo rows and serves native search', async () => {
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

      const state = createContext();
      const result = await migrateSqlFullTextMigration(state.context);
      expect(result).toEqual({
        applicable: true,
        provider,
        analyzerVersion: signatures[provider],
        targetId: metadata.targetId,
        prechecked: 1,
        scanned: 1,
        validated: 1,
        deletedLegacyCount: 1
      });
      expect(await MongoDatasetDataText.countDocuments()).toBe(0);
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
        stage: 'cleanup'
      });

      driver.search.mockResolvedValue([
        { vectorId: '1', collectionId, score: 2.5 },
        { vectorId: '999', collectionId, score: 1 }
      ]);
      const queryProps = {
        teamId,
        datasetIds: [datasetId],
        query: '内容',
        limit: 10,
        forbidCollectionIdList: []
      };
      expect(await searchSqlFullText(queryProps)).toEqual([
        { dataId: String(doc._id), collectionId, score: 2.5 }
      ]);
      expect(await getFullTextStore().search(queryProps)).toEqual([
        { dataId: String(doc._id), collectionId, score: 2.5 }
      ]);
    });

    it('blocks fill and legacy cleanup when preflight fails and repeats preflight on retry', async () => {
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
        { stageKey: 'preflight', data: { id: String(doc._id) } }
      ]);

      driver.preflight.mockClear().mockResolvedValue([]);
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        prechecked: 1,
        scanned: 1,
        validated: 1,
        deletedLegacyCount: 1
      });
      // 先重试原错误，再从起点检查完整范围，验收通过后才清理旧表。
      expect(driver.preflight).toHaveBeenCalledTimes(2);
      expect(await state.context.getFailedRecords()).toEqual([]);
      expect(await MongoDatasetDataText.countDocuments()).toBe(0);
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
  }
);
