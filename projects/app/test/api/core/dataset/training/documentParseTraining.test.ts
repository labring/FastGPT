import fileHandler from '@/pages/api/core/dataset/collection/create/fileId';
import linkHandler from '@/pages/api/core/dataset/collection/create/link';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import * as datasetRead from '@fastgpt/service/core/dataset/read';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { getRootUser } from '@test/datas/users';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/service/core/dataset/collection/mq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/mq')>()),
  pushCollectionUpdateJob: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getFileMetadata: async () => ({ filename: 'source.txt' })
  })
}));

const sourceLink = 'https://example.com/document';

const createParseContext = async () => {
  const root = await getRootUser();
  const models = getModelTestDefaults();
  const dataset = await MongoDataset.create({
    name: 'Document training',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModelId: models.embedding?.modelId,
    agentModelId: models.llm?.modelId
  });
  const settings = {
    datasetId: String(dataset._id),
    trainingType: DatasetCollectionDataProcessModeEnum.chunk
  };
  const fileId = `dataset/${settings.datasetId}/source.txt`;
  const createFile = () => Call(fileHandler, { auth: root, body: { ...settings, fileId } });
  const createLink = () =>
    Call(linkHandler, { auth: root, body: { ...settings, link: sourceLink } });
  const detail = (id: string) => Call(detailHandler, { auth: root, query: { id } });
  return { root, fileId, createFile, createLink, detail };
};

it('reports a pending link parse without inserting a legacy parse task', async () => {
  const { createLink, detail } = await createParseContext();
  const created = await createLink();
  expect(created.code).toBe(200);
  expect(created.data).toMatchObject({
    collectionId: expect.any(String),
    results: { insertLen: 0 }
  });
  const { collectionId } = created.data;

  expect(await detail(collectionId)).toMatchObject({
    code: 200,
    data: {
      activeTrainingAmount: 1,
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    }
  });
  expect(await MongoDatasetData.countDocuments({ collectionId })).toBe(0);
  expect(await MongoDatasetTraining.countDocuments({ collectionId })).toBe(0);
});

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl).each(['link', 'file'] as const)(
  'parses and indexes a %s through one document job',
  async (source) => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    const rawText = 'The document contains searchable text for the team.';
    const read = vi
      .spyOn(datasetRead, 'readDatasetSourceRawText')
      .mockResolvedValue({ title: source === 'link' ? 'Parsed document' : undefined, rawText });

    try {
      const { root, fileId, createFile, createLink, detail } = await createParseContext();
      const created = await (source === 'file' ? createFile() : createLink());
      expect(created.code).toBe(200);
      const { collectionId } = created.data;
      const queue = datasetTrainingMQService.getQueue();
      expect(
        (await queue.getJobs(['waiting', 'prioritized', 'active']))
          .filter((job) => job.data.collectionId === collectionId)
          .map((job) => job.data)
      ).toEqual([{ collectionId }]);

      await initDatasetTrainingWorker();
      await vi.waitFor(
        async () => {
          expect(await detail(collectionId)).toMatchObject({
            code: 200,
            data: {
              name: source === 'file' ? 'source.txt' : 'Parsed document',
              activeTrainingAmount: 0,
              finalErrorAmount: 0,
              slowestTrainingStatus: CollectionTrainingStatusEnum.ready
            }
          });
          expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
          expect(
            (await MongoDatasetCollection.findById(collectionId).lean())?.training
          ).toBeUndefined();
        },
        { timeout: 10_000 }
      );
      const indexed = await MongoDatasetData.find({ collectionId }).lean();
      expect(indexed).toHaveLength(1);
      expect(indexed[0]).toMatchObject({
        q: rawText,
        indexes: expect.arrayContaining([expect.objectContaining({ dataId: expect.any(String) })])
      });
      expect(indexed[0].indexStatus).toBeUndefined();
      expect(read).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledWith(
        expect.objectContaining({
          type:
            source === 'file'
              ? DatasetSourceReadTypeEnum.fileLocal
              : DatasetSourceReadTypeEnum.link,
          sourceId: source === 'file' ? fileId : sourceLink
        })
      );
      expect(await MongoUsage.countDocuments({ teamId: root.teamId })).toBe(1);
      expect(await MongoDatasetTraining.countDocuments({ collectionId })).toBe(0);
    } finally {
      read.mockRestore();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'keeps an exhausted parse error and indexes data appended during parsing',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
    if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();
    const parsing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const read = vi.spyOn(datasetRead, 'readDatasetSourceRawText').mockImplementation(async () => {
      parsing.resolve();
      await release.promise;
      throw new Error('Source cannot be read');
    });

    try {
      const { root, createLink, detail } = await createParseContext();
      const created = await createLink();
      expect(created.code).toBe(200);
      const { collectionId } = created.data;
      await initDatasetTrainingWorker();
      await parsing.promise;
      expect(
        await Call(pushHandler, {
          auth: root,
          body: {
            collectionId,
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            data: [{ q: 'Independently appended text' }]
          }
        })
      ).toMatchObject({ code: 200, data: { insertLen: 1 } });
      release.resolve();

      const queue = datasetTrainingMQService.getQueue();
      await vi.waitFor(
        async () => {
          expect(await detail(collectionId)).toMatchObject({
            code: 200,
            data: { activeTrainingAmount: 0, finalErrorAmount: 1 }
          });
          expect(await MongoDatasetCollection.findById(collectionId).lean()).toMatchObject({
            training: { parse: { status: 'error', errorMsg: 'Source cannot be read' } }
          });
          const [data] = await MongoDatasetData.find({ collectionId }).lean();
          expect(data).toMatchObject({
            q: 'Independently appended text',
            indexes: expect.arrayContaining([
              expect.objectContaining({ dataId: expect.any(String) })
            ])
          });
          expect(data.indexStatus).toBeUndefined();
          expect(read).toHaveBeenCalledTimes(3);
          expect((await queue.getDeduplicationJobId(collectionId)) ?? undefined).toBeUndefined();
        },
        { timeout: 8000 }
      );
    } finally {
      release.resolve();
      read.mockRestore();
      await closeRedisRuntime();
    }
  },
  15_000
);
