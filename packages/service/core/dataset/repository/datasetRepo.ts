import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type {
  DatasetApiSyncRepository,
  DatasetLegacySystemRootMetaDTO,
  DatasetPermissionLockDTO
} from '@fastgpt/dal/db/repos/dataset/repo.type';
import { Types } from '../../../common/mongo';
import { MongoDataset } from '../schema';

/**
 * datasets 的 Mongo 仓储适配层。
 * 实现 `@fastgpt/dal/db/repos/dataset/repo.type` 公开契约，统一收口裸 Model 访问、
 * `ObjectId` 转换与 `DbSession` 解包，出口仅返回窄 DTO。
 */
export const datasetRepo: DatasetApiSyncRepository = {
  /**
   * 锁住知识库文档并递增 collectionPermissionVersion，返回最新的 apiDatasetServer 快照。
   * 写权限事务通过版本自增与并发启停托管产生写冲突，重试时重读最新配置决定是否丢弃旧轮次。
   */
  bumpCollectionPermissionVersion: async ({
    datasetId,
    teamId,
    tx
  }): Promise<DatasetPermissionLockDTO | null> => {
    const doc = await MongoDataset.findOneAndUpdate(
      { _id: datasetId, teamId },
      { $inc: { collectionPermissionVersion: 1 } },
      { session: unwrapMongoSession(tx), new: true }
    )
      .select('apiDatasetServer')
      .lean();
    if (!doc) return null;
    return {
      apiDatasetServer: doc.apiDatasetServer
    };
  },

  /**
   * 递增 API 知识库的同步范围版本，并按需同步更新 `syncAll`。
   * 用于在同一 Dataset 文档上将范围变更与 Pro 自动建档串行化（写冲突由事务层重试）。
   */
  updateSyncScope: async ({ teamId, datasetId, syncAll, tx }) => {
    const mongoSession = unwrapMongoSession(tx);
    await MongoDataset.updateOne(
      { _id: datasetId, teamId },
      {
        ...(syncAll !== undefined ? { $set: { syncAll } } : {}),
        $inc: { syncScopeVersion: 1 }
      },
      mongoSession ? { session: mongoSession } : undefined
    );
  },

  /** 读取清理历史 SYSTEM_ROOT 哨兵所需的知识库元信息。 */
  findLegacySystemRootMetaById: async ({
    datasetId,
    tx
  }): Promise<DatasetLegacySystemRootMetaDTO | null> => {
    const doc = await MongoDataset.findById(
      new Types.ObjectId(datasetId),
      '_id teamId collectionPermissionEnabled'
    )
      .lean()
      .session(unwrapMongoSession(tx) ?? null);
    if (!doc) return null;
    return {
      _id: String(doc._id),
      teamId: String(doc.teamId),
      collectionPermissionEnabled: doc.collectionPermissionEnabled
    };
  },

  /** 回填历史知识库的 `syncAll = true`。 */
  markSyncAllEnabled: async ({ datasetId, tx }) => {
    const mongoSession = unwrapMongoSession(tx);
    await MongoDataset.updateOne(
      { _id: new Types.ObjectId(datasetId) },
      { $set: { syncAll: true } },
      mongoSession ? { session: mongoSession } : undefined
    );
  }
};
