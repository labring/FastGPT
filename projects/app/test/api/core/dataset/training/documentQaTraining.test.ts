import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import retryHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const { generateQa } = vi.hoisted(() => ({ generateQa: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/llm/request')>()),
  createLLMResponse: generateQa
}));

const createQaContext = async () => {
  const fixture = await createDatasetCollectionFixture();
  const { root, dataset, scope } = fixture;
  const models = getModelTestDefaults();
  await dataset.updateOne({
    $set: { vectorModelId: models.embedding?.modelId, agentModelId: models.llm?.modelId }
  });

  const push = () =>
    Call(pushHandler, {
      auth: root,
      body: {
        collectionId: scope.collectionId,
        trainingType: DatasetCollectionDataProcessModeEnum.qa,
        data: [{ q: 'Source material for generated question and answer pairs.' }]
      }
    });
  const detail = () => Call(detailHandler, { auth: root, query: { id: scope.collectionId } });
  return { ...fixture, push, detail };
};

it('reports pending QA without precreating index rows or writing a legacy QA task', async () => {
  const { push, detail, scope } = await createQaContext();
  const pushed = await push();
  expect(pushed.code).toBe(200);
  expect(pushed.data).toMatchObject({ insertLen: 1, dataIds: [] });

  expect(await detail()).toMatchObject({
    code: 200,
    data: {
      activeTrainingAmount: 1,
      slowestTrainingMode: TrainingModeEnum.qa,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    }
  });
  expect(await MongoDatasetData.countDocuments({ collectionId: scope.collectionId })).toBe(0);
  expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);
});

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)('converts one QA document job into ready searchable data', async () => {
  if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
  await closeRedisRuntime();
  configureRedisRuntime({ redisUrl });
  vi.mocked(bullMQ.getQueue).mockRestore();
  vi.mocked(bullMQ.getWorker).mockRestore();
  const generating = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  generateQa.mockImplementationOnce(async () => {
    generating.resolve();
    await release.promise;
    return {
      answerText:
        'Q1: Who owns the document?\nA1: The team.\nQ2: What is indexed?\nA2: Its content.',
      usage: { inputTokens: 8, outputTokens: 12 }
    };
  });

  try {
    const { push, detail, root, scope } = await createQaContext();
    expect((await push()).code).toBe(200);
    const queue = datasetTrainingMQService.getQueue();
    expect(
      (await queue.getJobs(['waiting', 'prioritized', 'active']))
        .filter((job) => job.data.collectionId === scope.collectionId)
        .map((job) => job.data)
    ).toEqual([{ collectionId: scope.collectionId }]);

    await initDatasetTrainingWorker();
    await generating.promise;
    expect(
      await Call(trainingDetailHandler, { auth: root, query: { collectionId: scope.collectionId } })
    ).toMatchObject({
      code: 200,
      data: { queuedCounts: { qa: 0 }, trainingCounts: { qa: 1 } }
    });
    release.resolve();
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
      },
      { timeout: 10_000 }
    );
    const rows = await MongoDatasetData.find({ collectionId: scope.collectionId })
      .sort({ q: -1 })
      .lean();
    expect(rows.map(({ q, a }) => ({ q, a: a?.trim() }))).toEqual([
      { q: 'Who owns the document?', a: 'The team.' },
      { q: 'What is indexed?', a: 'Its content.' }
    ]);
    expect(rows.every((row) => row.indexStatus === undefined && row.indexes.length > 0)).toBe(true);
    expect(generateQa).toHaveBeenCalledTimes(1);
    expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);
  } finally {
    release.resolve();
    await closeRedisRuntime();
  }
});

it.skipIf(!redisUrl)(
  'processes only the requested QA retry while the document is indexing',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    const embeddingStarted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    mockGetVectors.mockImplementationOnce(async ({ inputs }) => {
      embeddingStarted.resolve();
      await release.promise;
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });
    generateQa.mockClear().mockResolvedValue({
      answerText: 'Q1: What is the recovered content?\nA1: The requested task.',
      usage: { inputTokens: 8, outputTokens: 12 }
    });
    try {
      const { root, scope } = await createQaContext();
      const { collectionId } = scope;
      expect(
        await Call(pushHandler, {
          auth: root,
          body: {
            collectionId,
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            data: [{ q: 'Direct index content' }]
          }
        })
      ).toMatchObject({ code: 200, data: { insertLen: 1 } });
      const [retry, other] = await datasetQaTrainingService.createMany({
        items: [
          {
            teamId: String(scope.teamId),
            tmbId: String(scope.tmbId),
            datasetId: String(scope.datasetId),
            collectionId: String(scope.collectionId),
            status: 'error',
            q: 'Retry this source'
          },
          {
            teamId: String(scope.teamId),
            tmbId: String(scope.tmbId),
            datasetId: String(scope.datasetId),
            collectionId: String(scope.collectionId),
            status: 'error',
            q: 'Keep this failure'
          }
        ]
      });
      await initDatasetTrainingWorker();
      await embeddingStarted.promise;
      expect(
        await Call(retryHandler, {
          auth: root,
          body: { collectionId, dataId: String(retry._id) }
        })
      ).toMatchObject({ code: 200 });
      release.resolve();

      const queue = datasetTrainingMQService.getQueue();
      await vi.waitFor(
        async () => {
          const rows = await MongoDatasetData.find({ collectionId }).lean();
          expect(rows.map(({ q }) => q).sort()).toEqual([
            'Direct index content',
            'What is the recovered content?'
          ]);
          expect(rows.every(({ indexStatus, indexes }) => !indexStatus && indexes.length > 0)).toBe(
            true
          );
          expect(await datasetQaTrainingService.findById({ id: retry._id })).toBeNull();
          expect(await datasetQaTrainingService.findById({ id: other._id })).toMatchObject({
            status: 'error'
          });
          expect(generateQa).toHaveBeenCalledTimes(1);
          expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
        },
        { timeout: 8000 }
      );
    } finally {
      release.resolve();
      await closeRedisRuntime();
    }
  },
  15_000
);
