import {
  bridgeClientSessionToDbSession,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import {
  resumeUnpaidDatasetTraining,
  settleDatasetTrainingRoundAfterWrite
} from '@fastgpt/service/core/dataset/training/runtime';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches/lease';
import { reconcileDatasetTraining } from './documentWorker';

const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);
const reconcileLease = new LeaseCache();
const unpaidQaRetentionMs = 30 * 24 * 60 * 60 * 1000;

/** 启动或定时从主库恢复漏投和空训练状态，一个实例扫描，单个文档失败继续处理后续文档。 */
export const reconcileDatasetTrainingDocuments = async () => {
  try {
    await reconcileLease.withLease({
      key: 'datasetTrainingReconcile',
      label: 'dataset training reconciliation',
      ttlMs: 60_000,
      fn: async ({ assertValid }) => {
        const documents = MongoDatasetCollection.find({ 'training.status': 'active' }, { _id: 1 })
          .read('primary')
          .lean()
          .cursor();

        for await (const { _id } of documents) {
          assertValid();
          const collectionId = String(_id);
          await reconcileDatasetTraining(collectionId).catch((error) => {
            logger.error('Dataset training reconciliation failed for collection', {
              collectionId,
              error
            });
          });
        }
        await reconcilePausedDocuments(assertValid);
      }
    });
  } catch (error) {
    if (!(error instanceof RedisLeaseUnavailableError)) throw error;
  }
};

/** 每个暂停团队查一次主库余额，充值回调中断可由下一次对账恢复。 */
async function reconcilePausedDocuments(assertValid: () => void) {
  const cutoff = new Date(Date.now() - unpaidQaRetentionMs);
  const paused = { 'training.status': 'paused_unpaid' };
  const teams = await MongoDatasetCollection.distinct('teamId', paused).read('primary');

  for (const id of teams) {
    assertValid();
    const teamId = String(id);
    const balance = await resumeUnpaidDatasetTraining({ teamId, refreshBalance: true }).catch(
      (error) => {
        logger.error('Failed to reconcile unpaid dataset training', { teamId, error });
      }
    );
    if (balance !== 'unpaid') continue;

    const documents = MongoDatasetCollection.find(
      { ...paused, teamId, 'training.pausedAt': { $lte: cutoff } },
      { _id: 1, datasetId: 1, 'training.pausedAt': 1 }
    )
      .read('primary')
      .lean()
      .cursor();
    for await (const { _id, datasetId, training } of documents) {
      assertValid();
      const scope = { teamId, datasetId, collectionId: String(_id) };
      if (
        !(await datasetQaTrainingService.exists({
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(_id)
        }))
      )
        continue;
      await mongoSessionRun(async (session) => {
        const tx = bridgeClientSessionToDbSession(session);
        // 和充值恢复竞争同一个集合写锁，只清理仍处于本次暂停的 QA。
        const result = await MongoDatasetCollection.updateOne(
          { ...paused, _id, teamId, datasetId, 'training.pausedAt': training?.pausedAt },
          { $inc: { 'training.revision': 1 } },
          { session }
        );
        if (!result.matchedCount) return;

        await datasetQaTrainingService.deleteMany({
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(_id),
          tx
        });
        await settleDatasetTrainingRoundAfterWrite(scope, tx);
      }).catch((error) => {
        logger.error('Failed to expire unpaid dataset QA', { ...scope, error });
      });
    }
  }
}
