import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetCollection } from '../collection/schema';
import { MongoDataset } from '../schema';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

/**
 * 迁移历史根哨兵 collection（`apiFileId === 'SYSTEM_ROOT'`）。
 *
 * 旧实现把整库导入的根哨兵落成真实 collection 行，新实现不再产生该行（哨兵只用于展开子树）。
 * 迁移在同一个事务内完成：置 `syncAllFiles=true` → 子节点上提为本地根级 → 删哨兵 ACL 行与
 * 节点本身。返回是否发生了迁移。
 *
 * 只改结构，不动 ACL：collection 权限是物化快照，子节点现有行本来就是从哨兵行物化的，
 * 上提不改变任何人的访问权。之后的漂移由正常路径收敛（dataset ACL 变更走 syncRootCollections，
 * 外部权限同步走同步作业），迁移期间不需要也不应该重塑权限。
 *
 * 必须在 seed 计算之前调用：否则哨兵的旧行会让 `getApiFileSyncRootIds` 把它当成同步根。
 */
export const migrateRootSentinelCollection = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<boolean> => {
  const sentinel = await MongoDatasetCollection.findOne(
    { teamId, datasetId, apiFileId: RootCollectionId },
    '_id'
  ).lean();
  if (!sentinel) return false;

  const sentinelId = String(sentinel._id);

  await mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.findOne({ _id: datasetId, teamId }, '_id')
      .session(session)
      .lean();
    if (!dataset) return;

    await MongoDataset.updateOne(
      { _id: datasetId, teamId },
      { $set: { 'apiDatasetServer.syncAllFiles': true } },
      { session }
    );

    // 子节点上提为根：父级与 server 父级都清空，后续按知识库根重新计算。
    // 快照保持原样：子节点 ACL 本来就是从哨兵行物化的，上提不改访问权。
    await MongoDatasetCollection.updateMany(
      { teamId, datasetId, parentId: sentinel._id },
      { $set: { parentId: null }, $unset: { apiFileParentId: 1 } },
      { session }
    );

    await MongoResourcePermission.deleteMany(
      {
        teamId,
        resourceType: PerResourceTypeEnum.collection,
        resourceId: sentinelId
      },
      { session }
    );
    await MongoDatasetCollection.deleteOne({ _id: sentinel._id, teamId }, { session });
  });

  logger.info('[permissionSync] migrated legacy root sentinel collection', {
    teamId,
    datasetId,
    collectionId: sentinelId
  });
  return true;
};
