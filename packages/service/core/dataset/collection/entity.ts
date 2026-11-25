import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Types } from '../../../common/mongo';
import { syncResourceTreePermissions } from '../../../support/permission/resourcePermissionService';
import { MongoDatasetCollection } from './schema';

/**
 * 批量统计指定团队知识库内所有层级的非目录 collection 数量，不按文件权限过滤。
 * 未命中或非法的 datasetId 返回 0；没有有效 ID 时不查询数据库。
 * 复用类型/目录索引避免回表，精确计数仍需扫描范围内的非目录索引项。
 */
export const countDatasetCollectionsByDatasetIds = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  datasetIds.forEach((id) => counts.set(id, 0));

  const validIds = datasetIds.filter((id) => Types.ObjectId.isValid(id));
  if (validIds.length === 0) return counts;

  // Mongo 聚合不会执行 Mongoose 的自动转型，teamId 和 datasetId 必须显式转 ObjectId。
  const rows = await MongoDatasetCollection.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        datasetId: { $in: validIds.map((id) => new Types.ObjectId(id)) },
        type: { $ne: DatasetCollectionTypeEnum.folder }
      }
    },
    { $group: { _id: '$datasetId', count: { $sum: 1 } } }
  ]);

  rows.forEach((row) => counts.set(String(row._id), row.count));
  return counts;
};

/** 将指定集合批量翻为独立权限态（inheritPermission=false）。 */
export const markDatasetCollectionsIndependent = async ({
  teamId,
  datasetId,
  collectionIds,
  tx
}: {
  teamId: string;
  datasetId: string;
  collectionIds: string[];
  tx?: DbSession;
}) => {
  if (collectionIds.length === 0) return;

  await MongoDatasetCollection.updateMany(
    { teamId, datasetId, _id: { $in: collectionIds } },
    { $set: { inheritPermission: false } },
    { session: unwrapMongoSession(tx) }
  );
};

/** 将目录集合的新协作者集合向下物化到继承态后代，遇到 stopResourceIds 停止传播。 */
export const syncDatasetCollectionTreePermissions = ({
  collectionId,
  teamId,
  parentId,
  oldParentCollaborators,
  newParentCollaborators,
  stopResourceIds,
  tx
}: {
  collectionId: string;
  teamId: string;
  parentId: string | null;
  oldParentCollaborators: CollaboratorItemType[];
  newParentCollaborators: CollaboratorItemType[];
  stopResourceIds?: Set<string>;
  tx: DbSession;
}) => {
  const session = unwrapMongoSession(tx);
  if (!session) {
    throw new Error('Mongo transaction session is required for collection permission tree sync');
  }

  return syncResourceTreePermissions({
    resource: {
      _id: collectionId,
      type: DatasetCollectionTypeEnum.folder,
      teamId,
      parentId,
      inheritPermission: true
    },
    resourceModel: MongoDatasetCollection,
    resourceType: PerResourceTypeEnum.collection,
    oldParentCollaborators,
    newParentCollaborators,
    stopResourceIds,
    session
  });
};
