import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import deleteTrainingDataHandler from '@/pages/api/core/dataset/training/deleteTrainingData';
import getTrainingErrorHandler from '@/pages/api/core/dataset/training/getTrainingError';
import rebuildHandler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import deleteDatasetHandler from '@/pages/api/core/dataset/delete';
import retryTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { RedisBullMQRuntime } from '@fastgpt/dal/redis/bullmq/runtime';
import {
  datasetTrainingMQService,
  type DatasetTrainingJobData
} from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import type { Processor } from '@fastgpt/dal/redis/bullmq/types';
import {
  closeRedisRuntime,
  configureRedisRuntime,
  getRedisRuntime
} from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { mockVectorDelete, mockVectorInsert } from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.unmock(import('@fastgpt/service/core/ai/model/catalog/service'));
vi.mock('@fastgpt/service/core/dataset/collection/mq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/mq')>()),
  pushCollectionUpdateJob: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/core/dataset/delete', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/delete')>()),
  addDatasetDeleteJob: vi.fn().mockResolvedValue(undefined)
}));

const createRebuildContext = async () => {
  const fixture = await createDatasetCollectionFixture();
  const { collection, dataset, root, scope } = fixture;
  const { llm, embedding } = getModelTestDefaults();
  if (!llm || !embedding) throw new Error('Default test models are not initialized');
  const nextModel = {
    ...embedding,
    modelId: '507f1f77bcf86cd799439052',
    model: 'next-document-embedding',
    name: 'next-document-embedding'
  };
  addModelTestModel(nextModel);
  await dataset.updateOne({
    $set: { vectorModelId: embedding.modelId, agentModelId: llm.modelId }
  });
  const indexed = await MongoDatasetData.create({
    ...scope,
    q: 'This document already has a searchable chunk.',
    indexes: [{ type: DatasetDataIndexTypeEnum.custom, text: 'Saved index', dataId: 'old-vector' }],
    indexStatus: DatasetDataIndexStatusEnum.indexed
  });
  const rebuild = () =>
    Call(rebuildHandler, {
      auth: root,
      body: { datasetId: scope.datasetId, vectorModelId: nextModel.modelId }
    });
  const detail = () => Call(detailHandler, { auth: root, query: { id: String(collection._id) } });
  return { ...fixture, indexed, nextModel, rebuild, detail };
};

it('switches the model and reports rebuild work without writing a legacy rebuild task', async () => {
  const { detail, nextModel, rebuild, scope } = await createRebuildContext();
  expect(await rebuild()).toMatchObject({ code: 200 });
  expect(await MongoDataset.findById(scope.datasetId).lean()).toMatchObject({
    vectorModelId: nextModel.modelId
  });
  expect(await detail()).toMatchObject({
    code: 200,
    data: {
      activeTrainingAmount: 1,
      slowestTrainingMode: TrainingModeEnum.rebuildIndex,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    }
  });
  expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);
});

it('keeps one bill with complete usage items when QA is appended during a rebuild', async () => {
  const { rebuild, root, scope, nextModel } = await createRebuildContext();
  expect(await rebuild()).toMatchObject({ code: 200 });
  const usageId = (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
    ?.usageId;
  expect(usageId).toEqual(expect.any(String));
  expect(await MongoUsageItem.findOne({ usageId }).lean()).toMatchObject({
    itemType: UsageItemTypeEnum.training_vector,
    modelId: nextModel.modelId
  });

  const results = await Promise.all(
    ['First source', 'Second source'].map((q) =>
      Call(pushHandler, {
        auth: root,
        body: {
          collectionId: scope.collectionId,
          trainingType: DatasetCollectionDataProcessModeEnum.qa,
          data: [{ q }]
        }
      })
    )
  );
  expect(results).toEqual([
    expect.objectContaining({ code: 200, data: { insertLen: 1, dataIds: [] } }),
    expect.objectContaining({ code: 200, data: { insertLen: 1, dataIds: [] } })
  ]);
  expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
  expect(await MongoDatasetCollection.findById(scope.collectionId).lean()).toMatchObject({
    training: { usageId }
  });
  expect(
    await MongoUsageItem.find({ usageId, itemType: UsageItemTypeEnum.training_qa }).lean()
  ).toMatchObject([{ amount: 0, modelId: getModelTestDefaults().llm?.modelId }]);
});

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)(
  'hands a stalled rebuild to a second Redis worker and rejects the first result',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    const redisRuntime = getRedisRuntime();
    const firstRuntime = new RedisBullMQRuntime({
      redisRuntime,
      hookName: 'first-training-worker'
    });
    const secondRuntime = new RedisBullMQRuntime({
      redisRuntime,
      hookName: 'second-training-worker'
    });
    const release = Promise.withResolvers<void>();
    let processJob: Processor<DatasetTrainingJobData> | undefined;
    const queue = datasetTrainingMQService.getQueue();
    const registerFirst = vi
      .spyOn(datasetTrainingMQService, 'getWorker')
      .mockImplementation((processor) => {
        processJob = processor;
        return firstRuntime.getWorker(queue.name, processor, {
          lockDuration: 1600,
          stalledInterval: 200,
          skipLockRenewal: true,
          skipStalledCheck: true
        });
      });
    mockGetVectors.mockClear();
    mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
      await release.promise;
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });
    mockVectorInsert
      .mockResolvedValueOnce({ insertIds: ['recovered-vector'] })
      .mockResolvedValueOnce({ insertIds: ['late-vector'] });

    try {
      const { indexed, rebuild, scope } = await createRebuildContext();
      expect(await rebuild()).toMatchObject({ code: 200 });
      const jobId = await queue.getDeduplicationJobId(scope.collectionId);
      expect(jobId).toEqual(expect.any(String));
      const first = await initDatasetTrainingWorker();
      await vi.waitFor(() => expect(mockGetVectors).toHaveBeenCalledOnce(), { timeout: 5000 });
      const firstRun = (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
        ?.runId;
      expect(firstRun).toEqual(expect.any(String));
      expect(await (await queue.client).pttl(queue.toKey(`${jobId}:lock`))).toBeGreaterThan(0);
      await first.pause(true);

      if (!processJob) throw new Error('The first worker must register the document processor');
      const second = secondRuntime.getWorker(queue.name, processJob, { stalledInterval: 200 });
      const stalled = vi.fn();
      second.on('stalled', stalled);
      await vi.waitFor(
        async () => {
          expect(stalled).toHaveBeenCalledWith(jobId, 'active');
          expect(await MongoDatasetData.findById(indexed._id).lean()).toMatchObject({
            indexes: [{ dataId: 'recovered-vector' }]
          });
          expect(
            (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training?.runId
          ).not.toBe(firstRun);
        },
        { timeout: 10_000 }
      );
      release.resolve();
      await vi.waitFor(() =>
        expect(mockVectorDelete).toHaveBeenCalledWith({
          teamId: scope.teamId,
          idList: ['late-vector']
        })
      );
      expect(mockGetVectors).toHaveBeenCalledTimes(2);
      expect(await MongoDatasetData.findById(indexed._id).lean()).toMatchObject({
        indexes: [{ dataId: 'recovered-vector' }]
      });
    } finally {
      release.resolve();
      registerFirst.mockRestore();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'rejects an in-flight rebuild after the dataset delete is accepted',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    const release = Promise.withResolvers<void>();
    mockGetVectors.mockClear();
    mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
      await release.promise;
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });
    mockVectorInsert.mockResolvedValueOnce({ insertIds: ['late-vector'] });

    try {
      const { indexed, rebuild, root, scope } = await createRebuildContext();
      expect(await rebuild()).toMatchObject({ code: 200 });
      await initDatasetTrainingWorker();
      await vi.waitFor(() => expect(mockGetVectors).toHaveBeenCalledOnce(), { timeout: 5000 });

      expect(
        await Call(deleteDatasetHandler, { auth: root, query: { id: scope.datasetId } })
      ).toMatchObject({ code: 200 });
      expect(await MongoDataset.findById(scope.datasetId).lean()).toMatchObject({
        deleteTime: expect.any(Date)
      });
      release.resolve();

      await vi.waitFor(() =>
        expect(mockVectorDelete).toHaveBeenCalledWith({
          teamId: scope.teamId,
          idList: ['late-vector']
        })
      );
      expect(await MongoDatasetData.findById(indexed._id).lean()).toMatchObject({
        indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
        indexes: [{ dataId: 'old-vector' }]
      });
      expect(
        (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
      ).not.toHaveProperty('runId');
    } finally {
      release.resolve();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'resumes a running rebuild after rejecting a stale worker commit',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    const release = Promise.withResolvers<void>();
    mockGetVectors.mockClear();
    mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
      await release.promise;
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });
    mockVectorInsert
      .mockResolvedValueOnce({ insertIds: ['stale-vector'] })
      .mockResolvedValueOnce({ insertIds: ['recovered-vector'] });

    try {
      const { indexed, rebuild, scope } = await createRebuildContext();
      expect(await rebuild()).toMatchObject({ code: 200 });
      const queue = datasetTrainingMQService.getQueue();
      await initDatasetTrainingWorker();
      await vi.waitFor(() => expect(mockGetVectors).toHaveBeenCalled(), { timeout: 5000 });
      expect(await MongoDatasetData.findById(indexed._id).lean()).toMatchObject({
        indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning
      });
      // 模拟领取权已经转移，旧模型请求仍可能晚到。
      await MongoDatasetCollection.updateOne(
        { _id: scope.collectionId },
        { $set: { 'training.runId': 'replacement-run' } }
      );
      release.resolve();

      await vi.waitFor(
        async () => {
          const data = await MongoDatasetData.findById(indexed._id).lean();
          expect(data).not.toHaveProperty('indexStatus');
          expect(data?.indexes[0].dataId).toBe('recovered-vector');
          expect(mockVectorDelete).toHaveBeenCalledWith({
            teamId: scope.teamId,
            idList: ['stale-vector']
          });
          expect(
            (await queue.getDeduplicationJobId(scope.collectionId)) ?? undefined
          ).toBeUndefined();
          expect(
            (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
          ).toBeUndefined();
        },
        { timeout: 10_000 }
      );
    } finally {
      release.resolve();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'rebuilds stored indexes with the new model through one document job',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    mockGetVectors.mockClear();

    try {
      const { indexed, rebuild, nextModel, detail, scope } = await createRebuildContext();
      expect(await rebuild()).toMatchObject({ code: 200 });
      const queue = datasetTrainingMQService.getQueue();
      expect(
        (await queue.getJobs(['waiting', 'prioritized', 'active']))
          .filter(({ data }) => data.collectionId === scope.collectionId)
          .map(({ data }) => data)
      ).toEqual([{ collectionId: scope.collectionId }]);
      expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(
        0
      );

      await initDatasetTrainingWorker();
      await vi.waitFor(
        async () => {
          expect(await detail()).toMatchObject({
            code: 200,
            data: {
              activeTrainingAmount: 0,
              finalErrorAmount: 0,
              slowestTrainingStatus: CollectionTrainingStatusEnum.ready
            }
          });
          expect(
            (await queue.getDeduplicationJobId(scope.collectionId)) ?? undefined
          ).toBeUndefined();
        },
        { timeout: 10_000 }
      );
      expect(mockGetVectors).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({ modelId: nextModel.modelId })
        })
      );
      const result = await MongoDatasetData.findById(indexed._id).lean();
      expect(result?.indexStatus).toBeUndefined();
      expect(result?.indexes).toMatchObject([
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'Saved index',
          dataId: expect.any(String)
        }
      ]);
      expect(result?.indexes[0].dataId).not.toBe('old-vector');
      expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
    } finally {
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'retries and deletes failed model rebuild tasks through the public APIs',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();

    let rejectEmbedding = true;
    const originalEmbedding = mockGetVectors.getMockImplementation();
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      if (rejectEmbedding) throw new Error('Rebuild embedding failed');
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });
    try {
      const { root, scope, indexed, detail, rebuild } = await createRebuildContext();
      const deleted = await MongoDatasetData.create({
        ...scope,
        q: 'Another stored chunk',
        indexes: [
          { type: DatasetDataIndexTypeEnum.custom, text: 'Other index', dataId: 'removed-vector' }
        ],
        indexStatus: DatasetDataIndexStatusEnum.indexed
      });
      const { collectionId } = scope;
      const queue = datasetTrainingMQService.getQueue();
      const errors = () =>
        Call(getTrainingErrorHandler, {
          auth: root,
          body: { collectionId, pageSize: 10, offset: 0 }
        });
      expect((await rebuild()).code).toBe(200);
      const billBefore = (await MongoDatasetCollection.findById(collectionId).lean())?.training
        ?.usageId;
      expect(billBefore).toBeDefined();
      await initDatasetTrainingWorker();
      await vi.waitFor(
        async () => {
          expect(await detail()).toMatchObject({
            code: 200,
            data: { activeTrainingAmount: 0, finalErrorAmount: 2 }
          });
          expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
        },
        { timeout: 10_000 }
      );
      expect(await errors()).toMatchObject({
        code: 200,
        data: {
          total: 2,
          list: expect.arrayContaining(
            [indexed, deleted].map(({ _id }) =>
              expect.objectContaining({
                _id: String(_id),
                mode: TrainingModeEnum.rebuildIndex,
                errorMsg: 'Rebuild embedding failed'
              })
            )
          )
        }
      });
      expect(
        await Call(trainingDetailHandler, { auth: root, query: { collectionId } })
      ).toMatchObject({
        code: 200,
        data: { errorCounts: { rebuildIndex: 2 }, trainingCounts: { rebuildIndex: 0 } }
      });

      rejectEmbedding = false;
      expect(
        (
          await Call(retryTrainingHandler, {
            auth: root,
            body: { collectionId, dataId: String(indexed._id) }
          })
        ).code
      ).toBe(200);
      await vi.waitFor(
        async () => {
          expect(
            (await MongoDatasetData.findById(indexed._id).lean())?.indexStatus
          ).toBeUndefined();
          expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
        },
        { timeout: 10_000 }
      );
      expect(
        String((await MongoDatasetCollection.findById(collectionId).lean())?.training?.usageId)
      ).toBe(String(billBefore));

      expect(
        (
          await Call(deleteTrainingDataHandler, {
            auth: root,
            body: { collectionId, dataId: String(deleted._id) }
          })
        ).code
      ).toBe(200);
      expect(await MongoDatasetData.findById(deleted._id).lean()).toBeNull();
      expect(mockVectorDelete).toHaveBeenCalledWith(
        expect.objectContaining({ idList: ['removed-vector'] })
      );
      expect(
        (await MongoDatasetCollection.findById(collectionId).lean())?.training
      ).toBeUndefined();
      expect(await errors()).toMatchObject({ code: 200, data: { total: 0 } });
      expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
    } finally {
      if (originalEmbedding) mockGetVectors.mockImplementation(originalEmbedding);
      await closeRedisRuntime();
    }
  }
);
