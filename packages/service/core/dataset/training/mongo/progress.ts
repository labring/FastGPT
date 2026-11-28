import type { DbSession } from '@fastgpt/dal/db/types';
import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { bridgeDbSessionToClientSession } from '../../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../../collection/schema';

export type DatasetTrainingRun = { collectionId: string; runId: string };

/** 供仍通过 Mongo 写入训练阶段的路径复用同一份所有权条件。 */
export const getMongoTrainingRunMatch = ({ collectionId, runId }: DatasetTrainingRun) => ({
  _id: collectionId,
  'training.status': 'active' as const,
  'training.runId': runId
});

/** 领取新切片，同时清空之前的处理中标记。 */
export const claimDatasetTrainingRun = async (
  { collectionId, runId }: DatasetTrainingRun,
  tx?: DbSession
): Promise<DatasetCollectionSchemaType | null> =>
  MongoDatasetCollection.findOneAndUpdate(
    { _id: collectionId, 'training.status': 'active' },
    {
      $set: { 'training.runId': runId },
      $unset: { 'training.runningItems': '' },
      $inc: { 'training.revision': 1 }
    },
    { new: true, session: bridgeDbSessionToClientSession(tx) }
  ).lean();

/** 提交工作结果前锁住当前轮次，和追加、暂停及接管共享写冲突检测。 */
export const lockDatasetTrainingRun = async (
  run: DatasetTrainingRun,
  tx?: DbSession
): Promise<boolean> =>
  (
    await MongoDatasetCollection.updateOne(
      getMongoTrainingRunMatch(run),
      { $inc: { 'training.revision': 1 } },
      { session: bridgeDbSessionToClientSession(tx) }
    )
  ).matchedCount > 0;

/** 标记当前切片实际开始处理的阶段。 */
export const markDatasetTrainingItemRunning = async (
  { run, itemId, stage }: { run: DatasetTrainingRun; itemId: string; stage: TrainingModeEnum },
  tx?: DbSession
): Promise<boolean> =>
  (
    await MongoDatasetCollection.updateOne(
      getMongoTrainingRunMatch(run),
      { $set: { [`training.runningItems.${itemId}`]: stage } },
      { session: bridgeDbSessionToClientSession(tx) }
    )
  ).matchedCount > 0;

/** 清理当前切片的单项进度，或在切片结束时一起释放所有权。 */
export const clearDatasetTrainingProgress = async (
  { run, itemId }: { run: DatasetTrainingRun; itemId?: string },
  tx?: DbSession
): Promise<void> => {
  const unset =
    itemId === undefined
      ? { 'training.runId': '', 'training.runningItems': '' }
      : { [`training.runningItems.${itemId}`]: '' };
  await MongoDatasetCollection.updateOne(
    getMongoTrainingRunMatch(run),
    { $unset: unset },
    { session: bridgeDbSessionToClientSession(tx) }
  );
};

/** 欠费暂停时释放切片及进度，后续恢复会重新领取。 */
export const pauseDatasetTrainingRun = async (
  run: DatasetTrainingRun,
  tx?: DbSession
): Promise<void> => {
  await MongoDatasetCollection.updateOne(
    getMongoTrainingRunMatch(run),
    {
      $set: { 'training.status': 'paused_unpaid', 'training.pausedAt': new Date() },
      $unset: { 'training.runId': '', 'training.runningItems': '' },
      $inc: { 'training.revision': 1 }
    },
    { session: bridgeDbSessionToClientSession(tx) }
  );
};
