import { MongoDataset } from '../schema';
import type { DatasetVectorData } from '@fastgpt/global/core/dataset/vectorData/type';

/** 只读取有效知识库；团队条件防止陈旧任务写到其他租户的记录。 */
export const findDatasetVectorData = (scope: { teamId: string; datasetId: string }) =>
  MongoDataset.findOne(
    { _id: scope.datasetId, teamId: scope.teamId, deleteTime: null },
    { vectorData: 1 }
  ).lean();

/** 更新内部索引状态；pending 必须匹配投递前的时间戳，防止覆盖立即消费后产生的新状态。 */
export const updateDatasetPgIndexState = ({
  teamId,
  datasetId,
  pgIndex,
  expectedCheckedAt
}: {
  teamId: string;
  datasetId: string;
  pgIndex: DatasetVectorData['pgIndex'];
  expectedCheckedAt?: Date;
}) =>
  MongoDataset.updateOne(
    {
      _id: datasetId,
      teamId,
      deleteTime: null,
      ...(pgIndex === 'pending'
        ? {
            'vectorData.pgIndex': { $nin: ['ready', 'building', 'removing', 'pending'] },
            'vectorData.pgIndexCheckedAt': expectedCheckedAt ?? null
          }
        : {})
    },
    { $set: { vectorData: { pgIndex, pgIndexCheckedAt: new Date() } } }
  );

/** 一次读取本次检索涉及的元数据，行数仍由 Redis/向量库提供。 */
export const findDatasetsVectorData = ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) =>
  MongoDataset.find(
    { teamId, _id: { $in: datasetIds }, deleteTime: null },
    { vectorData: 1 }
  ).lean();
