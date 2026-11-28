import { expect, it, vi } from 'vitest';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { LeaseCache } from '@fastgpt/dal/redis/caches/lease';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { getMigrationStates } from '@/migration/entity';
import { createSystemMigrationRunner } from '@/migration/runner';
import { retrySystemMigration, startManualSystemMigration } from '@/migration/service';
import { systemMigrations } from '@/migration/registry';
import { reconcileDatasetTrainingDocuments } from '@/service/core/dataset/training/documentReconcile';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import * as datasetRead from '@fastgpt/service/core/dataset/read';
import * as teamLimit from '@fastgpt/service/support/permission/teamLimit';
import { getModelTestDefaults } from '@test/modelCache';
import { openTrainingQueue } from '../../../../utils/datasetTrainingQueue';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;
const migrationId = '20261125_migrate_dataset_document_training';

it.skipIf(!redisUrl)(
  '管理入口失败重试后，通过真实 Redis 对账让文档 Worker 完成历史解析',
  async () => {
    const redis = await openTrainingQueue(redisUrl);

    const db = connectionMongo.connection.db;
    const registered = systemMigrations.find(({ id }) => id === migrationId);
    const models = getModelTestDefaults();
    if (!db || !registered || !models.embedding?.modelId)
      throw new Error('Database, registered migration or embedding fixture is unavailable');
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();
    const expiredCollectionId = new Types.ObjectId();
    const unpaidTeamId = new Types.ObjectId();
    const unpaidTmbId = new Types.ObjectId();
    const unpaidDatasetId = new Types.ObjectId();
    const dummyJobId = new Types.ObjectId();
    const legacySource = {
      _id: new Types.ObjectId(),
      teamId,
      tmbId,
      datasetId,
      collectionId,
      mode: 'parse',
      retryCount: 3
    };
    const expiredQa = {
      _id: new Types.ObjectId(),
      teamId: unpaidTeamId,
      tmbId: unpaidTmbId,
      datasetId: unpaidDatasetId,
      collectionId: expiredCollectionId,
      q: 'expired QA',
      status: 'active',
      chunkIndex: 0,
      createTime: new Date('2020-01-01'),
      updateTime: new Date('2020-01-01')
    };
    const collections = db.collection('dataset_collections');
    const qa = db.collection('dataset_qa_trainings');
    const received: string[] = [];
    const queue = datasetTrainingMQService.getQueue();
    const sourceText = 'The migrated source still trains through the document worker.';
    const read = vi
      .spyOn(datasetRead, 'readDatasetSourceRawText')
      .mockResolvedValue({ rawText: sourceText });
    const balance = vi.spyOn(teamLimit, 'checkTeamAIPoints').mockImplementation(async (id) => {
      if (id === String(unpaidTeamId)) throw TeamErrEnum.aiPointsNotEnough;
    });

    const migrations = [
      {
        ...registered,
        run: (context: Parameters<typeof registered.run>[0]) =>
          registered.run({
            ...context,
            reportProgress: async (progress) => {
              await context.reportProgress(progress);
              if (progress.key === 'validation' && progress.status === 'running') {
                await reconcileDatasetTrainingDocuments();
                expect(await qa.findOne({ _id: expiredQa._id })).toBeTruthy();
                expect(received).toEqual([]);
              }
            }
          })
      }
    ];
    const runner = createSystemMigrationRunner({ migrations });

    try {
      await queue.pause();
      const worker = await initDatasetTrainingWorker();
      worker.on('completed', ({ data }) => {
        received.push(data.collectionId);
      });
      await worker.waitUntilReady();
      await datasetTrainingMQService.enqueueBatch([String(dummyJobId)]);
      await db.collection('datasets').insertMany([
        {
          _id: datasetId,
          teamId,
          tmbId,
          name: 'Migrated knowledge base',
          type: 'dataset',
          vectorModelId: models.embedding.modelId
        },
        {
          _id: unpaidDatasetId,
          teamId: unpaidTeamId,
          tmbId: unpaidTmbId,
          name: 'Unpaid knowledge base',
          type: 'dataset',
          vectorModelId: models.embedding.modelId
        }
      ]);
      await collections.insertMany([
        {
          _id: collectionId,
          teamId,
          tmbId,
          datasetId,
          type: 'link',
          name: 'Migrated document',
          rawLink: 'https://example.com/legacy-document',
          trainingType: 'chunk'
        },
        {
          _id: expiredCollectionId,
          teamId: unpaidTeamId,
          tmbId: unpaidTmbId,
          datasetId: unpaidDatasetId,
          type: 'file',
          name: 'Expired document',
          training: {
            status: 'paused_unpaid',
            pausedAt: new Date('2020-01-01'),
            usageId: String(new Types.ObjectId()),
            revision: 1
          }
        }
      ]);
      await qa.insertOne(expiredQa);
      await db.collection('dataset_trainings').insertOne(legacySource);

      await runner.start();
      await runner.waitForBlockingMigrations();
      runner.startBackgroundMigrations();
      await new LeaseCache().withLease({
        key: 'datasetTrainingReconcile',
        label: 'test running reconciliation',
        ttlMs: 60_000,
        fn: async () => {
          await startManualSystemMigration(migrationId, migrations);
          await runner.wake();
          expect((await getMigrationStates([migrationId]))[0]).toMatchObject({ status: 'failed' });
          expect(await collections.findOne({ _id: collectionId })).not.toHaveProperty('training');
        }
      });

      await retrySystemMigration(migrationId, migrations);
      await runner.wake();
      expect((await getMigrationStates([migrationId]))[0]).toMatchObject({
        status: 'succeeded',
        result: { legacyTasks: 1, documents: 1, parse: 1 }
      });
      await expect(startManualSystemMigration(migrationId, migrations)).rejects.toThrow(
        'Only a waiting system migration can be started'
      );
      await expect(retrySystemMigration(migrationId, migrations)).rejects.toThrow(
        'Only a failed system migration can be retried'
      );
      expect(await db.collection('dataset_trainings').findOne({ _id: legacySource._id })).toEqual(
        legacySource
      );
      expect(await queue.isPaused()).toBe(true);
      expect(await qa.findOne({ _id: expiredQa._id })).toBeTruthy();
      expect(received).toEqual([]);

      await queue.resume();
      await reconcileDatasetTrainingDocuments();
      await vi.waitFor(
        async () => {
          expect(received).toContain(String(collectionId));
          expect(await collections.findOne({ _id: collectionId })).not.toHaveProperty('training');
          expect(await db.collection('dataset_datas').findOne({ collectionId })).toMatchObject({
            q: sourceText,
            indexes: expect.arrayContaining([
              expect.objectContaining({ dataId: expect.any(String) })
            ])
          });
        },
        { timeout: 10_000 }
      );
      expect(read).toHaveBeenCalledOnce();
      expect(await qa.findOne({ _id: expiredQa._id })).toBeNull();

      // 仅在隔离测试库演练验收后人工清理，Runner 的终态仍然不变。
      await db.collection('dataset_trainings').drop();
      await db.collection('migration_20261125_dataset_training_tasks').drop();
      await runner.wake();
      expect((await getMigrationStates([migrationId]))[0]).toMatchObject({ status: 'succeeded' });
      expect(await db.collection('dataset_datas').countDocuments({ collectionId })).toBe(1);
    } finally {
      runner.stop();
      read.mockRestore();
      balance.mockRestore();
      await redis.close();
    }
  }
);
