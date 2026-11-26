import detailHandler from '@/pages/api/core/dataset/collection/detail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import { reconcileDatasetTrainingDocuments } from '@/service/core/dataset/training/documentReconcile';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/service/core/dataset/collection/mq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/mq')>()),
  pushCollectionUpdateJob: vi.fn().mockResolvedValue(undefined)
}));

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)(
  'uses configured concurrency and yields after the 128-item indexing slice',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();

    const performance = getSystemInstanceConfig().performance.dataset;
    const previousConcurrency = performance.documentMaxProcess;
    const previousChunkConcurrency = performance.documentChunkMaxProcess;
    performance.documentMaxProcess = 1;
    performance.documentChunkMaxProcess = 3;
    const chunkCount = 129;
    const embeddingGate = Promise.withResolvers<void>();

    try {
      const large = await createDatasetCollectionFixture();
      const small = await createDatasetCollectionFixture({ user: large.root });
      const models = getModelTestDefaults();
      const modelUpdate = {
        $set: { vectorModelId: models.embedding?.modelId, agentModelId: models.llm?.modelId }
      };
      await large.dataset.updateOne(modelUpdate);
      await small.dataset.updateOne(modelUpdate);

      const push = (collectionId: string, chunks: string[]) =>
        Call(pushHandler, {
          auth: large.root,
          body: {
            collectionId,
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            data: chunks.map((q) => ({ q }))
          }
        });
      const detail = (id: string) => Call(detailHandler, { auth: large.root, query: { id } });
      const largeId = large.scope.collectionId;
      const smallId = small.scope.collectionId;
      const queue = datasetTrainingMQService.getQueue();

      // 注入首次投递故障，验证 API 仍确认 MongoDB 持久化的全部分块。
      const add = vi
        .spyOn(queue, 'addBulk')
        .mockRejectedValueOnce(new Error('Test Redis enqueue failed'));
      try {
        const chunks = Array.from(
          { length: chunkCount },
          (_, index) => `Large document chunk ${index}`
        );
        expect(await push(largeId, chunks)).toMatchObject({
          code: 200,
          data: { insertLen: chunkCount }
        });
        expect(add).toHaveBeenCalledTimes(1);
      } finally {
        add.mockRestore();
      }
      expect((await queue.getDeduplicationJobId(largeId)) ?? undefined).toBeUndefined();
      expect(await detail(largeId)).toMatchObject({ data: { activeTrainingAmount: chunkCount } });

      await reconcileDatasetTrainingDocuments();
      expect(await queue.getDeduplicationJobId(largeId)).toEqual(expect.any(String));
      expect(await push(smallId, ['One short document chunk'])).toMatchObject({ code: 200 });
      expect(await queue.getDeduplicationJobId(smallId)).toEqual(expect.any(String));
      const waitingDocuments = (await queue.getJobs(['waiting'])).map(
        ({ data }) => data.collectionId
      );
      expect(waitingDocuments).toEqual(expect.arrayContaining([largeId, smallId]));

      // 阻塞第一组调用，确认单篇文档可以同时开始三条任务。
      mockGetVectors.mockClear();
      for (let index = 0; index < 3; index++) {
        mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
          await embeddingGate.promise;
          return createMockVectorsResponse(inputs.map(({ input }) => input));
        });
      }
      const completed: string[] = [];
      let firstSliceSize: number | undefined;
      const worker = await initDatasetTrainingWorker();
      expect(await queue.getGlobalConcurrency()).toBe(1);
      worker.on('completed', ({ data: { collectionId } }) => {
        if (collectionId === largeId && completed.length === 0) {
          firstSliceSize = mockGetVectors.mock.calls.length;
        }
        if ([largeId, smallId].includes(collectionId)) completed.push(collectionId);
      });
      await vi.waitFor(() => expect(mockGetVectors).toHaveBeenCalledTimes(3), { timeout: 5000 });
      embeddingGate.resolve();

      await vi.waitFor(
        async () => {
          expect(completed).toEqual([largeId, smallId, largeId]);
          expect(firstSliceSize).toBe(128);
          for (const id of [largeId, smallId]) {
            expect(await detail(id)).toMatchObject({
              code: 200,
              data: {
                activeTrainingAmount: 0,
                finalErrorAmount: 0,
                slowestTrainingStatus: CollectionTrainingStatusEnum.ready
              }
            });
          }
        },
        { timeout: 35_000 }
      );
    } finally {
      embeddingGate.resolve();
      performance.documentMaxProcess = previousConcurrency;
      performance.documentChunkMaxProcess = previousChunkConcurrency;
      await closeRedisRuntime();
    }
  },
  45_000
);

it.skipIf(!redisUrl)(
  'requeues unfinished work and closes a finished round when completion callbacks are missed',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();

    const gate = Promise.withResolvers<void>();
    try {
      const { root, dataset, scope } = await createDatasetCollectionFixture();
      const { collectionId } = scope;
      const { embedding, llm } = getModelTestDefaults();
      await dataset.updateOne({
        $set: { vectorModelId: embedding?.modelId, agentModelId: llm?.modelId }
      });
      const push = (q: string) =>
        Call(pushHandler, {
          auth: root,
          body: { collectionId, data: [{ q }] }
        });
      expect(await push('Initial source chunk')).toMatchObject({
        code: 200,
        data: { insertLen: 1 }
      });

      mockGetVectors.mockClear();
      mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
        await gate.promise;
        return createMockVectorsResponse(inputs.map(({ input }) => input));
      });
      const worker = await initDatasetTrainingWorker();
      worker.removeAllListeners('completed');
      // 本次 Job 已领取分块后追加工作，去重会将补投留给完成回查或周期对账。
      await vi.waitFor(() => expect(mockGetVectors).toHaveBeenCalledOnce(), { timeout: 5000 });
      expect(await push('Source chunk appended during indexing')).toMatchObject({
        code: 200,
        data: { insertLen: 1 }
      });
      gate.resolve();
      const queue = datasetTrainingMQService.getQueue();
      const completedWithRemaining = (activeTrainingAmount: number) =>
        vi.waitFor(
          async () => {
            expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
            expect(
              await Call(detailHandler, { auth: root, query: { id: collectionId } })
            ).toMatchObject({ code: 200, data: { activeTrainingAmount } });
            expect(
              (await MongoDatasetCollection.findById(collectionId).lean())?.training
            ).toMatchObject({ status: 'active' });
          },
          { timeout: 8000 }
        );

      await completedWithRemaining(1);
      await reconcileDatasetTrainingDocuments();
      await completedWithRemaining(0);
      await reconcileDatasetTrainingDocuments();
      expect(
        (await MongoDatasetCollection.findById(collectionId).lean())?.training
      ).toBeUndefined();
    } finally {
      gate.resolve();
      await closeRedisRuntime();
    }
  },
  20_000
);
