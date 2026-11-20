import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

/** 历史全库同步写入的虚拟根哨兵 apiFileId，现已被 Dataset.syncAll 替代。 */
export const LEGACY_SYSTEM_ROOT_API_FILE_ID = 'SYSTEM_ROOT';

export type CleanSingleDatasetSystemRootResult = {
  sentinels: number;
  reparented: number;
};

/**
 * 在单库事务内清理一个知识库的 SYSTEM_ROOT 哨兵集合：
 * 1. 若知识库启用了集合级权限且哨兵为独立权限（inheritPermission=false），将直接继承态子节点
 *    标记为 inheritPermission=false 以保留其既有物化快照，防止重挂到根后发生权限漂移；
 * 2. 将哨兵下的直接子节点重挂到知识库根（parentId=null），并移除残留 apiFileParentId='SYSTEM_ROOT'；
 * 3. 删除哨兵自身的 ResourcePermission 记录，避免孤儿权限行；
 * 4. 回填所属 Dataset.syncAll = true 并删除哨兵集合。
 *
 * 重复执行安全：目标已清理时只读返回零变更。
 */
export const cleanSingleDatasetSystemRoot = async ({
  datasetId
}: {
  datasetId: string;
}): Promise<CleanSingleDatasetSystemRootResult> => {
  const datasetObjectId = new Types.ObjectId(datasetId);

  return mongoSessionRun(async (session) => {
    const [sentinels, dataset] = await Promise.all([
      MongoDatasetCollection.find(
        {
          datasetId: datasetObjectId,
          apiFileId: LEGACY_SYSTEM_ROOT_API_FILE_ID
        },
        '_id teamId datasetId inheritPermission'
      )
        .lean()
        .session(session),
      MongoDataset.findById(datasetObjectId, '_id teamId collectionPermissionEnabled')
        .lean()
        .session(session)
    ]);

    const sentinelIds = sentinels.map((s) => s._id);
    const sentinelIdStrings = sentinelIds.map(String);
    let reparented = 0;

    if (sentinelIds.length > 0) {
      const independentSentinelIds = sentinels
        .filter((s) => s.inheritPermission === false)
        .map((s) => s._id);

      // 启用集合级权限且哨兵自身是独立权限时，保留子节点当前物化快照而不自动改继承 Dataset ACL
      if (dataset?.collectionPermissionEnabled === true && independentSentinelIds.length > 0) {
        const res = await MongoDatasetCollection.updateMany(
          {
            datasetId: datasetObjectId,
            parentId: { $in: independentSentinelIds },
            inheritPermission: { $ne: false }
          },
          { $set: { parentId: null, inheritPermission: false } },
          { session }
        );
        reparented += res.modifiedCount;
      }

      const restRes = await MongoDatasetCollection.updateMany(
        {
          datasetId: datasetObjectId,
          parentId: { $in: sentinelIds }
        },
        { $set: { parentId: null } },
        { session }
      );
      reparented += restRes.modifiedCount;

      const teamIds = Array.from(
        new Set(
          [...sentinels.map((s) => String(s.teamId)), ...(dataset ? [String(dataset.teamId)] : [])]
            .filter(Boolean)
            .map((id) => new Types.ObjectId(id))
        )
      );

      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.collection,
          ...(teamIds.length > 0 ? { teamId: { $in: teamIds } } : {}),
          resourceId: { $in: sentinelIdStrings }
        },
        { session }
      );

      if (dataset) {
        await MongoDataset.updateOne(
          { _id: dataset._id },
          { $set: { syncAll: true } },
          { session }
        );
      }

      await MongoDatasetCollection.deleteMany({ _id: { $in: sentinelIds } }, { session });
    }

    await MongoDatasetCollection.updateMany(
      {
        datasetId: datasetObjectId,
        apiFileParentId: LEGACY_SYSTEM_ROOT_API_FILE_ID
      },
      { $unset: { apiFileParentId: '' } },
      { session }
    );

    return {
      sentinels: sentinelIds.length,
      reparented
    };
  });
};
