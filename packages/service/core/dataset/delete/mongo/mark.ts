import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';
import { bridgeDbSessionToClientSession } from '../../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDataset } from '../../schema';

/** 在同一事务内标记知识库删除并撤销在途训练的提交权。 */
export const markDatasetsForDeletion = async (
  input: { teamId: string; datasetIds?: string[] },
  tx?: DbSession
): Promise<void> => {
  if (!tx) {
    return runInTransaction((tx) => markDatasetsForDeletion(input, tx), { dialect: 'mongo' });
  }
  const { teamId, datasetIds } = input;
  const ids = datasetIds && { $in: datasetIds };
  const session = bridgeDbSessionToClientSession(tx);
  await MongoDataset.updateMany(
    { teamId, ...(ids && { _id: ids }) },
    { $set: { deleteTime: new Date() } },
    { session }
  );
  // 集合版本和 Worker 回写使用同一写锁，也会锁住尚未分配 runId 的活跃轮次。
  await MongoDatasetCollection.updateMany(
    { teamId, ...(ids && { datasetId: ids }), 'training.status': 'active' },
    {
      $unset: { 'training.runId': '', 'training.runningItems': '' },
      $inc: { 'training.revision': 1 }
    },
    { session }
  );
};
