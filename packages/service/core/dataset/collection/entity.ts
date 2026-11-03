import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types, type ClientSession } from '../../../common/mongo';
import { MongoDatasetCollection } from './schema';
import { UserError } from '@fastgpt/global/common/error/utils';

/**
 * 批量统计指定团队知识库内所有层级的非目录 collection 数量，不按文件权限过滤。
 * 未命中或非法的 datasetId 返回 0；没有有效 ID 时不查询数据库。
 * `type` 未包含在现有索引中，需要回表过滤，成本与范围内 collection 总数线性相关。
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

/** 首次直接上传时原子初始化稳定图片目录；重训继承该值，不依赖当前集合 _id 清理旧目录。 */
export const getOrCreateChunkImagePrefixId = async (scope: {
  teamId: string;
  datasetId: string;
  collectionId: string;
}) => {
  const filter = { _id: scope.collectionId, teamId: scope.teamId, datasetId: scope.datasetId };
  await MongoDatasetCollection.updateOne(
    { ...filter, chunkImagePrefixId: { $exists: false } },
    // 从 Mongo 的 _id 生成规范值，避免合法的大写 ObjectId 入参形成另一条目录。
    [{ $set: { chunkImagePrefixId: { $toString: '$_id' } } }]
  );
  const collection = await MongoDatasetCollection.findOne(filter)
    .select('chunkImagePrefixId')
    .lean();
  if (!collection?.chunkImagePrefixId) throw new UserError('Collection no longer exists');
  return collection.chunkImagePrefixId;
};

/** 重建前从删除事务读取最新目录；鉴权或远端拉取期间可能刚发生首次上传，不能沿用旧快照。 */
export const readChunkImagePrefixIdForRebuild = async ({
  teamId,
  datasetId,
  collectionId,
  session
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  session: ClientSession;
}) => {
  const collection = await MongoDatasetCollection.findOne({ _id: collectionId, teamId, datasetId })
    .select('chunkImagePrefixId')
    .session(session)
    .lean();
  if (!collection) throw new UserError('Collection no longer exists');
  return collection.chunkImagePrefixId;
};
