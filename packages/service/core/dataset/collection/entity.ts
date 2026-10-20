import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '../../../common/mongo';
import { MongoDatasetCollection } from './schema';

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
