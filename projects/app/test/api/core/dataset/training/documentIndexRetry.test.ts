import detailHandler from '@/pages/api/core/dataset/collection/detail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import getTrainingDataDetailHandler from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import getTrainingErrorHandler from '@/pages/api/core/dataset/training/getTrainingError';
import retryTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)(
  'lists a terminal document index error and retries it through BullMQ',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    vi.mocked(bullMQ.getQueue).mockRestore();
    vi.mocked(bullMQ.getWorker).mockRestore();

    let rejectEmbedding = true;
    const originalEmbedding = mockGetVectors.getMockImplementation();
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      if (rejectEmbedding) throw new Error('Embedding service rejected the input');
      return createMockVectorsResponse(inputs.map(({ input }) => input));
    });

    try {
      const { root, dataset, scope } = await createDatasetCollectionFixture();
      const models = getModelTestDefaults();
      await dataset.updateOne({
        $set: { vectorModelId: models.embedding?.modelId, agentModelId: models.llm?.modelId }
      });
      const draft = { type: DatasetDataIndexTypeEnum.custom, text: 'Original custom index' };
      const pushed = await Call(pushHandler, {
        auth: root,
        body: {
          collectionId: scope.collectionId,
          trainingType: DatasetCollectionDataProcessModeEnum.chunk,
          data: [{ q: 'The initial text', indexes: [draft] }]
        }
      });
      expect(pushed.code).toBe(200);
      const [dataId] = pushed.data.dataIds;
      expect(dataId).toEqual(expect.any(String));
      const detail = () => Call(detailHandler, { auth: root, query: { id: scope.collectionId } });

      await initDatasetTrainingWorker();
      await vi.waitFor(
        async () => {
          expect(await detail()).toMatchObject({
            code: 200,
            data: { finalErrorAmount: 1, slowestTrainingStatus: CollectionTrainingStatusEnum.error }
          });
        },
        { timeout: 10_000 }
      );

      const errors = () =>
        Call(getTrainingErrorHandler, {
          auth: root,
          body: { collectionId: scope.collectionId, pageSize: 10, offset: 0 }
        });
      const errorPage = await errors();
      expect(errorPage.error).toBeUndefined();
      expect(errorPage).toMatchObject({
        code: 200,
        data: {
          total: 1,
          list: [
            {
              _id: dataId,
              mode: TrainingModeEnum.index,
              indexes: [draft],
              errorMsg: 'Embedding service rejected the input'
            }
          ]
        }
      });
      expect(
        await Call(getTrainingDataDetailHandler, {
          auth: root,
          body: { collectionId: scope.collectionId, dataId }
        })
      ).toMatchObject({ code: 200, data: { _id: dataId, q: 'The initial text' } });
      expect(await MongoDatasetData.findById(dataId).lean()).toMatchObject({
        draftIndexes: [draft],
        indexes: []
      });

      rejectEmbedding = false;
      expect(
        (
          await Call(retryTrainingHandler, {
            auth: root,
            body: { collectionId: scope.collectionId, dataId, q: 'The corrected text' }
          })
        ).code
      ).toBe(200);
      await vi.waitFor(
        async () => {
          expect(await detail()).toMatchObject({
            code: 200,
            data: { finalErrorAmount: 0, slowestTrainingStatus: CollectionTrainingStatusEnum.ready }
          });
        },
        { timeout: 10_000 }
      );
      expect(await errors()).toMatchObject({ code: 200, data: { total: 0 } });
      const indexed = await MongoDatasetData.findById(dataId).lean();
      expect(indexed).toMatchObject({
        q: 'The corrected text',
        indexes: expect.arrayContaining([
          expect.objectContaining({ ...draft, dataId: expect.stringMatching(/.+/) })
        ])
      });
      expect(indexed).not.toHaveProperty('draftIndexes');
      expect(await MongoUsage.countDocuments({ teamId: scope.teamId })).toBe(1);
    } finally {
      if (originalEmbedding) mockGetVectors.mockImplementation(originalEmbedding);
      await closeRedisRuntime();
    }
  }
);
