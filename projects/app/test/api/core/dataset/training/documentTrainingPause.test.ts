import detailHandler from '@/pages/api/core/dataset/collection/detail';
import updateTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { reconcileDatasetTrainingDocuments } from '@/service/core/dataset/training/documentReconcile';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { CollectionTrainingStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { resumeUnpaidDatasetTraining } from '@fastgpt/service/core/dataset/training/runtime';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { subDays } from 'date-fns';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock(import('@fastgpt/service/support/permission/teamLimit'), async (importOriginal) => ({
  ...(await importOriginal()),
  checkTeamAIPoints: vi.fn()
}));

const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;

it.skipIf(!redisUrl)(
  'expires both QA statuses after 30 unpaid days and retains indexed data',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    vi.mocked(checkTeamAIPoints).mockRejectedValue(TeamErrEnum.aiPointsNotEnough);

    const createPausedDocument = async (pausedAt: Date) => {
      const { scope, root } = await createDatasetCollectionFixture();
      await MongoDatasetCollection.updateOne(
        { _id: scope.collectionId },
        {
          $set: {
            training: {
              status: 'paused_unpaid',
              pausedAt,
              usageId: String(new Types.ObjectId()),
              revision: 1
            }
          }
        }
      );
      await MongoDatasetQaTraining.create([
        { ...scope, tmbId: root.tmbId, q: 'Pending QA source', status: 'active' },
        { ...scope, tmbId: root.tmbId, q: 'Failed QA source', status: 'error', errorMsg: 'failed' }
      ]);
      await MongoDatasetData.create({ ...scope, tmbId: root.tmbId, q: 'Previously indexed' });
      return {
        scope,
        detail: () => Call(detailHandler, { auth: root, query: { id: scope.collectionId } })
      };
    };

    try {
      const recent = await createPausedDocument(subDays(new Date(), 29));
      const old = await createPausedDocument(subDays(new Date(), 31));
      await reconcileDatasetTrainingDocuments();

      expect(await recent.detail()).toMatchObject({ code: 200, data: { finalErrorAmount: 2 } });
      expect(await old.detail()).toMatchObject({
        code: 200,
        data: { trainingAmount: 0, slowestTrainingStatus: CollectionTrainingStatusEnum.ready }
      });
      expect(await MongoDatasetQaTraining.countDocuments(old.scope)).toBe(0);
      expect(await MongoDatasetData.countDocuments(old.scope)).toBe(1);
      expect(
        await MongoDatasetCollection.findById(old.scope.collectionId).lean()
      ).not.toHaveProperty('training');
    } finally {
      vi.mocked(checkTeamAIPoints).mockReset();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'recovers a paid pause in reconciliation after the payment wake fails',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();

    try {
      const { scope } = await createDatasetCollectionFixture();
      const usageId = String(new Types.ObjectId());
      await MongoDatasetCollection.updateOne(
        { _id: scope.collectionId },
        {
          $set: {
            training: {
              status: 'paused_unpaid',
              pausedAt: subDays(new Date(), 31),
              usageId,
              revision: 1
            }
          }
        }
      );
      await MongoDatasetQaTraining.create({ ...scope, q: 'Pending QA source' });

      vi.mocked(checkTeamAIPoints).mockRejectedValueOnce(new Error('Balance read interrupted'));
      await expect(
        resumeUnpaidDatasetTraining({ teamId: scope.teamId, refreshBalance: true })
      ).rejects.toThrow('Balance read interrupted');

      await reconcileDatasetTrainingDocuments();
      expect(await MongoDatasetCollection.findById(scope.collectionId).lean()).toMatchObject({
        training: { status: 'active', usageId }
      });
      expect(checkTeamAIPoints).toHaveBeenLastCalledWith(scope.teamId, { refreshBalance: true });
      expect(await MongoDatasetQaTraining.countDocuments(scope)).toBe(1);
      expect(
        await datasetTrainingMQService.getQueue().getDeduplicationJobId(scope.collectionId)
      ).toEqual(expect.any(String));
    } finally {
      vi.mocked(checkTeamAIPoints).mockReset();
      await closeRedisRuntime();
    }
  }
);

it.skipIf(!redisUrl)(
  'resumes an unpaid document through manual retry when the balance is sufficient',
  async () => {
    if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();

    try {
      const { scope, root } = await createDatasetCollectionFixture();
      const usageId = String(new Types.ObjectId());
      await MongoDatasetCollection.updateOne(
        { _id: scope.collectionId },
        {
          $set: {
            training: { status: 'paused_unpaid', pausedAt: new Date(), usageId, revision: 1 }
          }
        }
      );
      const qa = await MongoDatasetQaTraining.create({
        ...scope,
        tmbId: root.tmbId,
        q: 'Pending QA source',
        status: 'active'
      });

      expect(
        await Call(updateTrainingHandler, { auth: root, body: { dataId: String(qa._id) } })
      ).toMatchObject({ code: 200 });
      expect(await MongoDatasetCollection.findById(scope.collectionId).lean()).toMatchObject({
        training: { status: 'active', usageId }
      });
      expect(
        (await datasetTrainingMQService.getQueue().getJobs(['waiting', 'prioritized']))
          .filter((job) => job.data.collectionId === scope.collectionId)
          .map((job) => job.data)
      ).toEqual([{ collectionId: scope.collectionId }]);
      expect(
        (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
      ).not.toHaveProperty('pausedAt');
    } finally {
      await closeRedisRuntime();
    }
  }
);
