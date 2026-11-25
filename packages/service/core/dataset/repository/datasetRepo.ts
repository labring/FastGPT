import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import type { ClientSession, Types } from '../../../common/mongo';
import { MongoDataset } from '../schema';

const resolveMongoSession = (tx?: DbSession, session?: ClientSession) =>
  session ?? unwrapMongoSession(tx);

/**
 * datasets 的 Mongo 仓储适配层。
 * 统一收口裸 Model 访问与 `DbSession` 解包，业务层通过函数注入或调用仓储方法复用同一事务。
 */
export const datasetRepo = {
  /**
   * 锁住知识库文档并递增 collectionPermissionVersion，返回最新的 apiDatasetServer 快照。
   * 写权限事务通过版本自增与并发启停托管产生写冲突，重试时重读最新配置决定是否丢弃旧轮次。
   */
  bumpCollectionPermissionVersion: ({
    datasetId,
    teamId,
    tx
  }: {
    datasetId: string;
    teamId: string;
    tx?: DbSession;
  }) =>
    MongoDataset.findOneAndUpdate(
      { _id: datasetId, teamId },
      { $inc: { collectionPermissionVersion: 1 } },
      { session: unwrapMongoSession(tx), new: true }
    )
      .select('apiDatasetServer')
      .lean(),

  /**
   * 递增 API 知识库的同步范围版本，并按需同步更新 `syncAll`。
   * 用于在同一 Dataset 文档上将范围变更与 Pro 自动建档串行化（写冲突由事务层重试）。
   */
  updateSyncScope: async ({
    teamId,
    datasetId,
    syncAll,
    tx,
    session
  }: {
    teamId: string | Types.ObjectId;
    datasetId: string | Types.ObjectId;
    syncAll?: boolean;
    tx?: DbSession;
    session?: ClientSession;
  }) => {
    const mongoSession = resolveMongoSession(tx, session);
    await MongoDataset.updateOne(
      { _id: datasetId, teamId },
      {
        ...(syncAll !== undefined ? { $set: { syncAll } } : {}),
        $inc: { syncScopeVersion: 1 }
      },
      mongoSession ? { session: mongoSession } : undefined
    );
  }
};
