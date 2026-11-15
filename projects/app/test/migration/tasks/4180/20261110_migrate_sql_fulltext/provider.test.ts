import { SQL_FULL_TEXT_ANALYZER_VERSION } from '@fastgpt/global/core/dataset/fullText/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { randomUUID } from 'node:crypto';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { searchSqlFullText } from '@fastgpt/service/core/dataset/fullText/sql/store';
import { findSqlFullTextTargetById } from '@fastgpt/service/core/dataset/fullText/sql/entity';
import { systemMigrations, type SystemMigrationContext } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { enqueueManualMigration, ensureMigrationStates } from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

// 本用例验证显式选择原生读取后的业务行为；默认 Mongo 与手动回退由 textStore 用例覆盖。
vi.mock('@fastgpt/service/common/vectorDB/fullText/config', () => ({
  getFullTextProvider: () => driver.provider,
  shouldWriteMongoFullText: () => true
}));

vi.mock('@/migration/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  systemMigrationBatchSize: 2
}));

// 仅隔离物理驱动；Mongo 权威引用、断点、查询归一化与旧表清理执行真实代码。
const driver = vi.hoisted(() => ({
  provider: 'pg' as SqlFullTextProvider,
  prepare: vi.fn(),
  assertCapability: vi.fn(),
  getMetadata: vi.fn(),
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
    let metadata: { targetId: string; analyzerVersion: string };

    beforeEach(() => {
      driver.provider = provider;
      metadata = {
        targetId: randomUUID(),
        analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION
      };
      driver.prepare.mockReset().mockResolvedValue(metadata);
      driver.getMetadata.mockReset().mockResolvedValue(metadata);
      driver.assertCapability.mockReset().mockResolvedValue(undefined);
      driver.fill.mockReset().mockResolvedValue([]);
      driver.search.mockReset().mockResolvedValue([]);
    });

    it('prepares, backfills, validates, retains legacy Mongo rows and cuts over reads to native SQL search', async () => {
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
        analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION,
        targetId: metadata.targetId,
        scanned: 1,
        validated: 1
      });
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
      expect(driver.prepare).toHaveBeenCalledOnce();
      expect(driver.fill).toHaveBeenCalledWith(
        [{ vectorId: '1', teamId, datasetId, collectionId, text: '查询内容' }],
        false
      );
      expect(driver.fill).toHaveBeenCalledWith(
        [{ vectorId: '1', teamId, datasetId, collectionId, text: '查询内容' }],
        true
      );
      expect(state.checkpoint()).toMatchObject({
        provider,
        targetId: metadata.targetId,
        analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION,
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

    it('records failed backfills before advancing the cursor and retries them before validation', async () => {
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
      driver.fill.mockResolvedValue(['1']);
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(driver.fill).toHaveBeenCalledOnce();
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
      expect(state.checkpoint()).toMatchObject({
        lastId: String(doc._id),
        scanned: 1,
        validated: 0
      });
      expect(await state.context.getFailedRecords()).toMatchObject([
        {
          stageKey: 'scan',
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
          stageKey: 'scan',
          id: String(doc._id)
        })
      );

      driver.fill.mockClear().mockResolvedValue([]);
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        scanned: 1,
        validated: 1
      });
      // 先重试游标之前的错误，再全量验收，保留旧表与目标 ready 证据。
      expect(driver.fill).toHaveBeenCalledTimes(2);
      expect(await state.context.getFailedRecords()).toEqual([]);
      expect(await MongoDatasetDataText.countDocuments()).toBe(1);
    });

    it.each(['replace', 'delete'] as const)(
      'accepts concurrent %s and includes post-boundary native inserts without restoring old IDs',
      async (change) => {
        const teamId = new Types.ObjectId();
        const datasetId = new Types.ObjectId();
        const collectionId = new Types.ObjectId();
        const tmbId = new Types.ObjectId();
        const doc = await MongoDatasetData.create({
          teamId,
          datasetId,
          collectionId,
          tmbId,
          synonymVersion: 0,
          indexes: [{ dataId: '1', text: '旧文本', type: 'custom' }]
        });
        // 仅模拟 SQL 行状态；Mongo 引用读取、迁移恢复与 ready 写入均执行真实代码。
        const rows = new Map([['1', '旧文本']]);
        let changed = false;
        driver.fill.mockImplementation(
          async (expected: { vectorId: string; text: string }[], validateOnly: boolean) => {
            if (!changed) {
              expect(validateOnly).toBe(false);
              expect(expected.map(({ vectorId }) => vectorId)).toEqual(['1']);
              changed = true;
              if (change === 'replace') {
                // 新业务写入先提交同行向量/词串，再切换 Mongo 引用，最后删除旧向量。
                rows.set('2', '新文本');
                await MongoDatasetData.updateOne(
                  { _id: doc._id },
                  {
                    $set: { indexes: [{ dataId: '2', text: '新文本', type: 'custom' }] }
                  }
                );
              } else {
                await MongoDatasetData.deleteOne({ _id: doc._id });
              }
              rows.delete('1');
              rows.set('3', '新增文本');
              await MongoDatasetData.create({
                teamId,
                datasetId,
                collectionId,
                tmbId,
                synonymVersion: 0,
                indexes: [{ dataId: '3', text: '新增文本', type: 'custom' }]
              });
              return ['1'];
            }
            expect(validateOnly).toBe(true);
            return expected
              .filter((row) => rows.get(row.vectorId) !== row.text)
              .map((row) => row.vectorId);
          }
        );
        const state = createContext();
        expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
          scanned: 1,
          validated: change === 'replace' ? 2 : 1
        });
        expect(rows.has('1')).toBe(false);
        expect(rows.get('3')).toBe('新增文本');
        expect(rows.get('2')).toBe(change === 'replace' ? '新文本' : undefined);
        expect(await state.context.getFailedRecords()).toEqual([]);
        expect(await findSqlFullTextTargetById(provider)).toMatchObject({
          targetId: metadata.targetId
        });
      }
    );

    it('blocks readiness when the text changes in place under the same vector ID', async () => {
      const doc = await MongoDatasetData.create({
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '旧文本', type: 'custom' }]
      });
      driver.fill.mockImplementationOnce(async () => {
        await MongoDatasetData.updateOne(
          { _id: doc._id },
          { $set: { 'indexes.0.text': '新文本' } }
        );
        return [];
      });
      const state = createContext();
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(await state.context.getFailedRecords()).toMatchObject([
        { stageKey: 'scan', data: { id: String(doc._id) } }
      ]);
      expect(await findSqlFullTextTargetById(provider)).toBeNull();
    });

    it('blocks a missing SQL row while Mongo still references it and recovers after the delete commits', async () => {
      const doc = await MongoDatasetData.create({
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '删除中', type: 'custom' }]
      });
      driver.fill.mockResolvedValueOnce(['1']);
      const state = createContext();
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(await findSqlFullTextTargetById(provider)).toBeNull();
      await MongoDatasetData.deleteOne({ _id: doc._id });
      driver.fill.mockClear();
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        scanned: 1,
        validated: 0
      });
      expect(driver.fill).not.toHaveBeenCalled();
      expect(await state.context.getFailedRecords()).toEqual([]);
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
      driver.fill.mockRejectedValueOnce(new Error('ECONNRESET database connection lost'));
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow(
        'ECONNRESET database connection lost'
      );
      expect(await state.context.getFailedRecords()).toEqual([]);
      expect(state.context.logger.warn).not.toHaveBeenCalled();
      expect(doc._id).toBeDefined();
    });

    it('rejects resuming a checkpoint bound to a different physical target', async () => {
      const state = createContext();
      driver.fill.mockResolvedValue(['1']);
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
        analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION
      });
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow(
        'another SQL target or analyzer version'
      );
    });

    it('rejects a checkpoint from another analyzer rule before writing', async () => {
      const state = createContext();
      await state.context.saveCheckpoint({
        provider,
        targetId: metadata.targetId,
        analyzerVersion: 'future-rule',
        endId: null,
        lastId: null,
        scanned: 0,
        stage: 'scan',
        validationEndId: null,
        validationLastId: null,
        validated: 0
      });
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow();
      expect(driver.fill).not.toHaveBeenCalled();
    });

    it('retries validation failures after skipping the completed scan stage', async () => {
      await MongoDatasetData.create({
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        indexes: [{ dataId: '1', text: '验收冲突', type: 'custom' }]
      });
      const state = createContext();
      let conflict = true;
      driver.fill.mockImplementation(async (_rows, validateOnly) =>
        conflict && validateOnly ? ['1'] : []
      );
      await expect(migrateSqlFullTextMigration(state.context)).rejects.toThrow('unresolved');
      expect(state.checkpoint()).toMatchObject({ stage: 'validation', scanned: 1 });
      expect(await state.context.getFailedRecords()).toMatchObject([{ stageKey: 'validation' }]);
      conflict = false;
      expect(await migrateSqlFullTextMigration(state.context)).toMatchObject({
        scanned: 1,
        validated: 1
      });
      expect(await state.context.getFailedRecords()).toEqual([]);
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
      expect(driver.fill).toHaveBeenCalledWith(
        [
          {
            vectorId: '3',
            teamId: String(teamId),
            datasetId: String(datasetId),
            collectionId: String(collectionId),
            text: '健康可迁移数据'
          }
        ],
        false
      );
      expect(await state.context.getFailedRecords()).toEqual([
        {
          stageKey: 'scan',
          data: { id: String(badVectorDoc._id) },
          reason: { message: 'Full-text vector ID must be a positive signed bigint' }
        },
        {
          stageKey: 'scan',
          data: { id: String(badTextDoc._id) },
          reason: { message: 'Full-text input exceeds 1 MiB or contains a null character' }
        }
      ]);
      expect(healthyDoc._id).toBeDefined();
      expect(state.checkpoint()).toMatchObject({ lastId: String(healthyDoc._id), scanned: 3 });
      expect(state.context.reportFailedRecords.mock.invocationCallOrder.at(-1)).toBeLessThan(
        state.context.saveCheckpoint.mock.invocationCallOrder.at(-1)!
      );
    });
  }
);
