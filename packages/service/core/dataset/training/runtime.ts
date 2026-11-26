import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { datasetDataDocumentWorkStatuses } from '@fastgpt/global/core/dataset/data/utils';
import type { ClientSession } from '../../../common/mongo';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { MongoDatasetCollection } from '../collection/schema';
import { datasetDataTrainingStatusMatch } from '../data/query';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetQaTraining } from './qaSchema';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { getLogger, LogCategories } from '../../../common/logger';
import { teamPoint } from '../../../support/wallet/sub/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

const enqueueBatchSize = 500;

/** 投递已提交的文档工作；队列故障由周期对账补投。 */
export const enqueueDatasetTrainingBatch = async ({
  collectionIds,
  teamId
}: {
  collectionIds: string[];
  teamId: string;
}): Promise<void> => {
  if (!collectionIds.length) return;
  try {
    for (let offset = 0; offset < collectionIds.length; offset += enqueueBatchSize) {
      await datasetTrainingMQService.enqueueBatch(
        collectionIds.slice(offset, offset + enqueueBatchSize)
      );
    }
  } catch (error) {
    logger.error('Failed to enqueue committed document training', {
      teamId,
      collectionCount: collectionIds.length,
      error
    });
  }
};

type TrainingScope = { teamId: string; datasetId: string; collectionId: string };

/** 数据手工编辑或删除前写集合轮次，使操作和 Worker 提交、追加共享冲突检测。 */
export const touchDatasetTrainingRound = async (
  { collectionId, teamId, datasetId }: TrainingScope,
  session: ClientSession
) =>
  (
    await MongoDatasetCollection.updateOne(
      { _id: collectionId, teamId, datasetId, training: { $exists: true } },
      { $inc: { 'training.revision': 1 } },
      { session }
    )
  ).matchedCount > 0;

/** 手工写事务已锁住轮次时收尾，后续追加即刻开启新账单。 */
export const settleDatasetTrainingRoundAfterWrite = async (
  { teamId, datasetId, collectionId }: TrainingScope,
  session: ClientSession
) => {
  // 调用方也会传入完整分块，只能用文档范围查询余下工作。
  const scope = { teamId, datasetId, collectionId };
  if (await MongoDatasetQaTraining.exists(scope).read('primary').session(session)) return false;
  // 历史重建失败也属于未处理项，等待重试或删除时保留本轮账单。
  if (
    await MongoDatasetData.exists({
      ...scope,
      ...datasetDataTrainingStatusMatch
    }).session(session)
  ) {
    return false;
  }
  const result = await MongoDatasetCollection.updateOne(
    {
      _id: collectionId,
      teamId,
      datasetId,
      'training.parse': { $exists: false }
    },
    { $unset: { training: '' } },
    { session }
  );
  return result.modifiedCount > 0;
};

/** 余额恢复后唤醒本团队的工作，只有确认欠费时返回 unpaid。 */
export const resumeUnpaidDatasetTraining = async ({
  teamId,
  datasetId,
  collectionId,
  collectionIds,
  refreshBalance = false
}: {
  teamId: string;
  datasetId?: string;
  collectionId?: string;
  collectionIds?: string[];
  refreshBalance?: boolean;
}): Promise<void | 'unpaid'> => {
  if (collectionIds !== undefined && collectionIds.length === 0) return;
  const pausedMatch = {
    teamId,
    ...(datasetId && { datasetId }),
    ...(collectionId !== undefined
      ? { _id: collectionId }
      : collectionIds !== undefined && { _id: { $in: collectionIds } }),
    'training.status': 'paused_unpaid'
  };
  if (!(await MongoDatasetCollection.exists(pausedMatch).read('primary'))) return;

  // 支付提交后重新读余额，避免之前缓存的欠费结果使本次唤醒无效。
  if (refreshBalance) await teamPoint.clearTeamPointsCache(teamId);

  try {
    await checkTeamAIPoints(teamId, { refreshBalance });
  } catch (error) {
    if (error === TeamErrEnum.aiPointsNotEnough) return 'unpaid';
    throw error;
  }

  const paused = MongoDatasetCollection.find(pausedMatch, {
    _id: 1,
    datasetId: 1,
    'training.pausedAt': 1
  })
    .read('primary')
    .lean()
    .cursor();
  const wake: string[] = [];
  for await (const document of paused) {
    // 和 QA 清理使用同一集合写入，恢复只能命中本次读取到的暂停。
    const resumed = await MongoDatasetCollection.findOneAndUpdate(
      {
        ...pausedMatch,
        _id: document._id,
        'training.pausedAt': document.training?.pausedAt
      },
      {
        $set: { 'training.status': 'active' },
        $unset: {
          'training.pausedAt': '',
          'training.runId': ''
        },
        $inc: { 'training.revision': 1 }
      },
      { new: true, projection: { 'training.parse.status': 1 } }
    ).lean();
    if (!resumed) continue;

    const scope = { teamId, datasetId: document.datasetId, collectionId: document._id };
    if (
      resumed.training?.parse?.status === 'active' ||
      (await MongoDatasetQaTraining.exists({ ...scope, status: 'active' }).read('primary')) ||
      (await MongoDatasetData.exists({
        ...scope,
        indexStatus: { $in: datasetDataDocumentWorkStatuses },
        indexError: { $ne: true }
      }))
    ) {
      wake.push(String(document._id));
    }
  }
  await enqueueDatasetTrainingBatch({ teamId, collectionIds: wake });
};
