import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import dataDetailHandler from '@/pages/api/core/dataset/data/detail';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';
import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';
import { openTrainingQueue } from '../../../../utils/datasetTrainingQueue';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const createPushContext = async () => {
  const fixture = await createDatasetCollectionFixture();
  const models = getModelTestDefaults();
  await fixture.dataset.updateOne({
    $set: { vectorModelId: models.embedding?.modelId, agentModelId: models.llm?.modelId }
  });
  const { root, scope } = fixture;

  const push = (
    q: string,
    {
      indexSize,
      billId,
      indexes,
      collectionId = scope.collectionId
    }: {
      indexSize?: number;
      billId?: string;
      indexes?: PushDataChunkType['indexes'];
      collectionId?: string;
    } = {}
  ) =>
    Call(pushHandler, {
      auth: root,
      body: {
        collectionId,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        data: [{ q, a: 'Its searchable text.', indexes }],
        indexSize,
        billId
      }
    });
  const detail = () => Call(detailHandler, { auth: root, query: { id: scope.collectionId } });
  return { ...fixture, push, detail };
};

it('reports pending ordinary indexes without creating a legacy training task', async () => {
  const { push, detail, root, scope } = await createPushContext();
  const draft = { type: DatasetDataIndexTypeEnum.custom, text: 'Unique custom index' };
  const pushed = await push('What is in the document?', { indexes: [draft] });
  expect(pushed.code).toBe(200);
  expect(pushed.data).toMatchObject({ insertLen: 1, dataIds: [expect.any(String)] });
  const [dataId] = pushed.data.dataIds;
  expect(await MongoDatasetData.findById(dataId).lean()).toMatchObject({
    draftIndexes: [draft],
    indexes: []
  });
  expect(
    new MongoDatasetData({
      ...scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      indexes: [{ ...draft, dataId: '' }]
    }).validateSync()?.errors
  ).toHaveProperty(['indexes.0.dataId']);
  const dataDetail = await Call(dataDetailHandler, { auth: root, query: { id: dataId } });
  expect(dataDetail).toMatchObject({ code: 200, data: { indexes: [] } });
  expect(dataDetail.data).not.toHaveProperty('draftIndexes');

  const pending = await detail();
  expect(pending.code).toBe(200);
  expect(pending.data).toMatchObject({
    activeTrainingAmount: 1,
    slowestTrainingStatus: CollectionTrainingStatusEnum.running,
    finalErrorAmount: 0
  });
  expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);
});

it('honors the first training bill and rejects attempts to overwrite it', async () => {
  const { push, detail, scope } = await createPushContext();
  const createBill = async () =>
    MongoUsage.create({
      teamId: scope.teamId,
      tmbId: scope.tmbId,
      totalPoints: 0,
      source: UsageSourceEnum.training
    });
  const [first, other] = await Promise.all([createBill(), createBill()]);
  const billId = String(first._id);
  expect((await push('Initial chunk', { billId })).code).toBe(200);
  expect((await push('Another chunk', { billId })).code).toBe(200);

  const rejected = await push('Chunk with a conflicting bill', { billId: String(other._id) });
  expect(rejected.error).toBeInstanceOf(ApiHttpError);
  expect(rejected.error).toMatchObject({ statusCode: 409 });
  const malformed = await push('Chunk with an invalid bill ID', { billId: 'not-an-id' });
  expect(malformed.error).toMatchObject({ statusCode: 400 });
  expect(await detail()).toMatchObject({ code: 200, data: { activeTrainingAmount: 2 } });
  const collection = await MongoDatasetCollection.findById(scope.collectionId).lean();
  expect(collection?.training?.usageId).toBe(billId);
  expect(
    await MongoUsageItem.countDocuments({
      usageId: billId,
      itemType: UsageItemTypeEnum.training_vector
    })
  ).toBe(1);

  const sibling = await MongoDatasetCollection.create({
    ...scope,
    name: 'Other document',
    type: DatasetCollectionTypeEnum.file
  });
  const reused = await push('Chunk in another document', {
    billId,
    collectionId: String(sibling._id)
  });
  expect(reused.error).toMatchObject({ statusCode: 400 });
  expect(await MongoDatasetData.countDocuments({ collectionId: sibling._id })).toBe(0);
  expect((await MongoDatasetCollection.findById(sibling._id).lean())?.training).toBeUndefined();
});

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)(
  'runs one BullMQ job for two pushes and shows completed indexes in detail',
  async () => {
    const redis = await openTrainingQueue(redisUrl);

    try {
      const { datasetTrainingMQService } =
        await import('@fastgpt/dal/redis/bullmq/services/datasetTraining');
      const { push, detail, root, scope } = await createPushContext();
      const pushes = await Promise.all([
        push('What is in the document?', { indexSize: 128 }),
        push('Where is the matching information?', {
          indexSize: 256,
          collectionId: scope.collectionId.toUpperCase(),
          indexes: [
            { type: DatasetDataIndexTypeEnum.custom, text: '' },
            { type: DatasetDataIndexTypeEnum.custom, text: 'Unique custom index' }
          ]
        })
      ]);

      for (const pushed of pushes) {
        expect(pushed.code).toBe(200);
        expect(pushed.data).toMatchObject({ insertLen: 1, dataIds: [expect.any(String)] });
      }
      const queue = datasetTrainingMQService.getQueue();
      const jobs = await queue.getJobs(['waiting', 'prioritized', 'active']);
      expect(
        jobs
          .filter((job) => job.data.collectionId.toLowerCase() === scope.collectionId)
          .map((job) => job.data)
      ).toEqual([{ collectionId: scope.collectionId }]);
      expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
      expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(
        0
      );
      const pendingRows = await MongoDatasetData.find({ collectionId: scope.collectionId })
        .sort({ q: 1 })
        .lean();
      expect(pendingRows.map((row) => row.trainingIndexSize)).toEqual([128, 256]);
      expect(await detail()).toMatchObject({
        code: 200,
        data: {
          activeTrainingAmount: 2,
          slowestTrainingStatus: CollectionTrainingStatusEnum.running
        }
      });

      expect((await push('One more queued chunk')).code).toBe(200);
      const trainingDetail = () =>
        Call(trainingDetailHandler, { auth: root, query: { collectionId: scope.collectionId } });
      expect(await trainingDetail()).toMatchObject({
        code: 200,
        data: { queuedCounts: { index: 3 }, trainingCounts: { index: 0 } }
      });

      const embeddings = Promise.withResolvers<void>();
      const indexWhenReleased = async ({ inputs }: Parameters<typeof mockGetVectors>[0]) => {
        await embeddings.promise;
        return createMockVectorsResponse(inputs.map(({ input }) => input));
      };
      mockGetVectors
        .mockImplementationOnce(indexWhenReleased)
        .mockImplementationOnce(indexWhenReleased);
      const { initDatasetTrainingWorker } =
        await import('@/service/core/dataset/training/documentWorker');
      try {
        await initDatasetTrainingWorker();
        await vi.waitFor(
          async () => {
            expect(mockGetVectors).toHaveBeenCalledTimes(2);
            expect(await trainingDetail()).toMatchObject({
              code: 200,
              data: { queuedCounts: { index: 1 }, trainingCounts: { index: 2 } }
            });
          },
          { timeout: 10_000 }
        );
      } finally {
        embeddings.resolve();
      }
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
          expect(await trainingDetail()).toMatchObject({
            code: 200,
            data: { queuedCounts: { index: 0 }, trainingCounts: { index: 0 }, trainedCount: 3 }
          });
          const rows = await MongoDatasetData.find({ collectionId: scope.collectionId }).lean();
          expect(rows).toHaveLength(3);
          for (const row of rows) {
            expect(row.indexStatus).toBeUndefined();
            expect(row.trainingIndexSize).toBeUndefined();
            expect(row.draftIndexes).toBeUndefined();
            expect(row.indexes).toEqual(
              expect.arrayContaining([expect.objectContaining({ dataId: expect.any(String) })])
            );
          }
          expect(
            rows.flatMap(({ indexes }) =>
              indexes
                .filter(({ type }) => type === DatasetDataIndexTypeEnum.custom)
                .map(({ text }) => text)
            )
          ).toEqual(['Unique custom index']);
          expect(
            await MongoDatasetDataText.countDocuments({ collectionId: scope.collectionId })
          ).toBe(3);
          const collection = await MongoDatasetCollection.findById(scope.collectionId).lean();
          expect(collection?.training).toBeUndefined();
          expect(
            (await queue.getDeduplicationJobId(scope.collectionId)) ?? undefined
          ).toBeUndefined();
        },
        { timeout: 10_000 }
      );
    } finally {
      await redis.close();
    }
  }
);
