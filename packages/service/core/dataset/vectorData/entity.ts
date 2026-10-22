import { MongoDataset } from '../schema';
import type { DatasetVectorData } from '@fastgpt/global/core/dataset/vectorData/type';

/** 只读取有效知识库；团队条件防止陈旧任务写到其他租户的记录。 */
export const findDatasetVectorData = (scope: { teamId: string; datasetId: string }) =>
  MongoDataset.findOne(
    { _id: scope.datasetId, teamId: scope.teamId, deleteTime: null },
    { vectorData: 1 }
  ).lean();

/** 更新内部索引状态；pending 通知不得覆盖已经开始构建或已经 ready 的状态。 */
export const updateDatasetPgIndexState = ({
  teamId,
  datasetId,
  pgIndex
}: {
  teamId: string;
  datasetId: string;
  pgIndex: DatasetVectorData['pgIndex'];
}) =>
  MongoDataset.updateOne(
    {
      _id: datasetId,
      teamId,
      deleteTime: null,
      ...(pgIndex === 'pending'
        ? { 'vectorData.pgIndex': { $nin: ['ready', 'building', 'pending'] } }
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
