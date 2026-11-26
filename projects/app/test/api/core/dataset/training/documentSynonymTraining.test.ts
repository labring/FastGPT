import detailHandler from '@/pages/api/core/dataset/collection/detail';
import uploadHandler from '@/pages/api/core/dataset/synonym/upload';
import {
  initDatasetTrainingWorker,
  reconcileDatasetTraining
} from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { collectionUpdateMQService } from '@fastgpt/dal/redis/bullmq/services/collectionUpdate';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { mockGetVectors } from '@test/mocks/core/ai/embedding';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

it('reclaims the old synonym version on reconciliation while a QA error remains', async () => {
  const previousSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
  serviceEnv.DATASET_SYNONYM_ENABLED = true;
  try {
    const { collection, scope } = await createDatasetCollectionFixture();
    const { teamId, datasetId, collectionId } = scope;
    const config = await MongoDatasetSynonym.create({ teamId, datasetId, version: 2 });
    const oldMapping = await MongoDatasetSynonymMapping.create({
      teamId,
      datasetId,
      synonymFileId: config._id,
      logicalMappingId: new Types.ObjectId(),
      fileVersion: 1,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'old-version'
    });
    await MongoDatasetData.create({ ...scope, q: '如何退钱', synonymVersion: 2 });
    const failedQa = await MongoDatasetQaTraining.create({
      ...scope,
      q: '未完成的问答',
      status: 'error'
    });
    const training = { status: 'active', revision: 1, usageId: String(new Types.ObjectId()) };
    await collection.updateOne({ $set: { training } });

    await reconcileDatasetTraining(collectionId);

    expect(await MongoDatasetSynonymMapping.exists({ _id: oldMapping._id })).toBeNull();
    expect(await MongoDatasetQaTraining.exists({ _id: failedQa._id })).not.toBeNull();
    expect((await MongoDatasetCollection.findById(collectionId).lean())?.training).toMatchObject({
      status: 'active',
      usageId: training.usageId
    });
  } finally {
    serviceEnv.DATASET_SYNONYM_ENABLED = previousSynonymEnabled;
  }
});

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)('rebuilds changed indexes after a legacy synonym failure', async () => {
  if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
  await closeRedisRuntime();
  configureRedisRuntime({ redisUrl });
  vi.mocked(bullMQ.getQueue).mockRestore();
  vi.mocked(bullMQ.getWorker).mockRestore();
  mockGetVectors.mockClear();
  const previousSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
  serviceEnv.DATASET_SYNONYM_ENABLED = true;

  try {
    const { root, dataset, scope } = await createDatasetCollectionFixture();
    const { llm, embedding } = getModelTestDefaults();
    if (!llm || !embedding) throw new Error('Default test models are not initialized');
    await dataset.updateOne({
      $set: { vectorModelId: embedding.modelId, agentModelId: llm.modelId }
    });
    const data = await MongoDatasetData.create({
      ...scope,
      q: '如何退钱',
      indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
      synonymVersion: 0,
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: '如何退钱', dataId: 'old-refund-vector' },
        { type: DatasetDataIndexTypeEnum.custom, text: '营业时间', dataId: 'unchanged-vector' }
      ]
    });
    const detail = () => Call(detailHandler, { auth: root, query: { id: scope.collectionId } });

    expect(
      await Call(uploadHandler, {
        auth: root,
        body: {
          datasetId: scope.datasetId,
          mappings: [{ standardizedTerm: '退款', synonymTerms: ['退钱'] }]
        }
      })
    ).toMatchObject({ code: 200, data: { affectedDataCount: 1, fileVersion: 1 } });
    expect(await detail()).toMatchObject({
      code: 200,
      data: {
        slowestTrainingMode: TrainingModeEnum.rebuildSynonym,
        slowestTrainingStatus: CollectionTrainingStatusEnum.running
      }
    });
    const queue = datasetTrainingMQService.getQueue();
    const collectionUpdates = collectionUpdateMQService.getQueue();
    expect(
      (await queue.getJobs(['waiting', 'prioritized', 'active']))
        .filter(({ data }) => data.collectionId === scope.collectionId)
        .map(({ data }) => data)
    ).toEqual([{ collectionId: scope.collectionId }]);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);

    await initDatasetTrainingWorker();
    await vi.waitFor(
      async () => {
        expect(await detail()).toMatchObject({
          code: 200,
          data: {
            finalErrorAmount: 0,
            slowestTrainingStatus: CollectionTrainingStatusEnum.ready
          }
        });
        expect(
          (await queue.getDeduplicationJobId(scope.collectionId)) ?? undefined
        ).toBeUndefined();
        expect(
          (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
        ).toBeUndefined();
        expect(await collectionUpdates.getJobs(['delayed', 'waiting'])).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({ collectionId: scope.collectionId })
            })
          ])
        );
      },
      { timeout: 10_000 }
    );
    expect(mockGetVectors).toHaveBeenCalledOnce();
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: [{ type: 'text', input: '如何退款' }] })
    );
    const indexed = await MongoDatasetData.findById(data._id).lean();
    expect(indexed).toMatchObject({
      synonymVersion: 1,
      indexes: [
        { text: '如何退钱', dataId: expect.any(String) },
        { text: '营业时间', dataId: 'unchanged-vector' }
      ]
    });
    expect(indexed?.indexStatus).toBeUndefined();
    expect(indexed?.indexes[0].dataId).not.toBe('old-refund-vector');
    expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
  } finally {
    serviceEnv.DATASET_SYNONYM_ENABLED = previousSynonymEnabled;
    await closeRedisRuntime();
  }
});
