import detailHandler from '@/pages/api/core/dataset/collection/detail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  AdminDatasetTrainingEnhanceBodySchema,
  AdminDatasetTrainingEnhanceResponseSchema
} from '@fastgpt/global/openapi/admin/dataset/training/api';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getSystemConfigRuntimeState } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { getTestInstanceConfig, setTestLicenseActive } from '@test/utils/instanceConfigSnapshot';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const { postToPro } = vi.hoisted(() => ({ postToPro: vi.fn() }));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/thirdProvider/fastgptPro/api')>()),
  postDatasetTrainingEnhance: postToPro
}));

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl).each([
  {
    scenario: 'uses the Pro RPC to enhance and index a pushed document',
    enhancement: 'completed',
    expectedModes: ['auto']
  },
  {
    scenario: 'indexes the original text when the Pro license expires after enqueue',
    enhancement: 'expiredLicense',
    expectedModes: []
  },
  {
    scenario: 'skips all enhancement when Pro reports an unavailable license at the image stage',
    enhancement: 'proLicense',
    expectedModes: ['image']
  },
  {
    scenario: 'still tries automatic enhancement when only the image stage is skipped',
    enhancement: 'skipImage',
    expectedModes: ['image', 'auto']
  }
])('$scenario', async ({ enhancement, expectedModes }) => {
  if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
  await closeRedisRuntime();
  configureRedisRuntime({ redisUrl });
  if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
  if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
  const { license } = getTestInstanceConfig();
  const { frontendContext } = getSystemConfigRuntimeState();
  const previousLicense = license.data;
  const previousCommercialService = frontendContext.commercialService;
  setTestLicenseActive(true);
  const originalConcatUsage = global.concatUsageHandler;
  const concatUsage = vi.fn<typeof global.concatUsageHandler>().mockResolvedValue(undefined);
  global.concatUsageHandler = concatUsage;

  try {
    const { root, dataset, collection, scope } = await createDatasetCollectionFixture();
    const { llm, embedding } = getModelTestDefaults();
    if (!llm || !embedding) throw new Error('Default test models are not initialized');
    const vlmModel = {
      ...llm,
      modelId: '507f1f77bcf86cd799439024',
      model: 'dataset-enhance-vlm',
      name: 'dataset-enhance-vlm',
      config: { ...llm.config, vision: true }
    };
    if (enhancement === 'proLicense' || enhancement === 'skipImage') {
      addModelTestModel(vlmModel);
    }
    await dataset.updateOne({
      $set: {
        vectorModelId: embedding.modelId,
        agentModelId: llm.modelId,
        ...((enhancement === 'proLicense' || enhancement === 'skipImage') && {
          vlmModelId: vlmModel.modelId
        })
      }
    });
    await collection.updateOne({ $set: { autoIndexes: true } });
    postToPro.mockReset().mockImplementation(async (request) => {
      const parsed = AdminDatasetTrainingEnhanceBodySchema.parse(request);
      const nextIndexStatus =
        parsed.mode === DatasetDataIndexStageEnum.image && parsed.autoIndexes
          ? DatasetDataIndexStageEnum.auto
          : DatasetDataIndexStageEnum.index;
      await MongoDatasetData.updateOne(
        {
          _id: parsed.dataId,
          teamId: parsed.teamId,
          datasetId: parsed.datasetId,
          collectionId: parsed.collectionId,
          indexStatus: parsed.mode
        },
        {
          $set: { indexStatus: nextIndexStatus },
          $push: {
            draftIndexes: {
              $each: [
                { type: DatasetDataIndexTypeEnum.question, text: 'What is in this document?' },
                { type: DatasetDataIndexTypeEnum.summary, text: 'Summary of its content' }
              ]
            }
          }
        }
      );
      return AdminDatasetTrainingEnhanceResponseSchema.parse({ status: 'committed' });
    });

    const sourceText = 'This source text is eligible for automatic enhancement.';
    const draft = { type: DatasetDataIndexTypeEnum.custom, text: 'User supplied index' };
    const pushed = await Call(pushHandler, {
      auth: root,
      body: {
        collectionId: scope.collectionId,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        autoIndexes: true,
        data: [{ q: sourceText, indexes: [draft] }]
      }
    });
    expect(pushed.code).toBe(200);
    const [dataId] = pushed.data.dataIds;
    expect(dataId).toEqual(expect.any(String));
    expect(await MongoDatasetData.findById(dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.auto,
      draftIndexes: [draft],
      indexes: []
    });
    const queue = datasetTrainingMQService.getQueue();
    expect(
      (await queue.getJobs(['waiting', 'prioritized', 'active']))
        .filter(({ data }) => data.collectionId === scope.collectionId)
        .map(({ data }) => data)
    ).toEqual([{ collectionId: scope.collectionId }]);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: scope.collectionId })).toBe(0);

    if (enhancement === 'expiredLicense') {
      if (!license.data) throw new Error('Expected an active test license before enqueue');
      license.data.expiredTime = '2001-01-01T00:00:00.000Z';
    }
    if (enhancement === 'proLicense' || enhancement === 'skipImage') {
      await MongoDatasetData.updateOne(
        { _id: dataId },
        { $set: { indexStatus: DatasetDataIndexStageEnum.image } }
      );
      postToPro.mockReset().mockResolvedValue({
        status: 'skipped',
        ...(enhancement === 'proLicense' && { reason: 'license' })
      });
    }
    await initDatasetTrainingWorker();
    await vi.waitFor(
      async () => {
        expect(
          await Call(detailHandler, { auth: root, query: { id: scope.collectionId } })
        ).toMatchObject({
          code: 200,
          data: {
            activeTrainingAmount: 0,
            finalErrorAmount: 0,
            slowestTrainingStatus: CollectionTrainingStatusEnum.ready
          }
        });
        expect(
          await MongoDatasetCollection.exists({
            _id: scope.collectionId,
            training: { $exists: true }
          })
        ).toBeNull();
      },
      { timeout: 10_000 }
    );

    const trained = await MongoDatasetData.findById(dataId).lean();
    expect(trained).toMatchObject({
      indexes: expect.arrayContaining([
        expect.objectContaining({ ...draft, dataId: expect.stringMatching(/.+/) })
      ])
    });
    expect(trained).not.toHaveProperty('draftIndexes');
    const bills = await MongoUsage.find({ teamId: scope.teamId }).lean();
    expect(bills).toHaveLength(1);
    expect(postToPro.mock.calls.map(([request]) => request.mode)).toEqual(expectedModes);
    if (enhancement !== 'completed') {
      expect(trained).toMatchObject({
        q: sourceText,
        indexes: expect.arrayContaining([
          expect.objectContaining({
            type: DatasetDataIndexTypeEnum.default,
            text: sourceText,
            dataId: expect.stringMatching(/.+/)
          })
        ])
      });
      expect(trained?.indexes).toHaveLength(2);
      await vi.waitFor(() => {
        expect(concatUsage).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            usageId: String(bills[0]._id),
            itemType: UsageItemTypeEnum.training_vector
          })
        );
      });
      return;
    }

    const [request] = postToPro.mock.calls[0];
    expect(AdminDatasetTrainingEnhanceBodySchema.parse(request)).toMatchObject({
      teamId: scope.teamId,
      datasetId: scope.datasetId,
      collectionId: scope.collectionId,
      dataId,
      runId: expect.any(String),
      modelId: llm.modelId,
      usageId: String(bills[0]._id),
      mode: 'auto',
      q: sourceText
    });
    expect(trained).toMatchObject({
      indexes: expect.arrayContaining([
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.question,
          text: 'What is in this document?',
          dataId: expect.any(String)
        }),
        expect.objectContaining({
          type: DatasetDataIndexTypeEnum.summary,
          text: 'Summary of its content',
          dataId: expect.any(String)
        })
      ])
    });
    await vi.waitFor(() => {
      expect(concatUsage).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          usageId: String(bills[0]._id),
          itemType: UsageItemTypeEnum.training_vector
        })
      );
    });
  } finally {
    try {
      await closeRedisRuntime();
    } finally {
      global.concatUsageHandler = originalConcatUsage;
      license.data = previousLicense;
      frontendContext.commercialService = previousCommercialService;
    }
  }
});
