import { MongoDataset } from '../schema';
import type { DatasetVectorData } from '@fastgpt/global/core/dataset/vectorData/type';

/** 只读取有效知识库；团队条件防止陈旧任务写到其他租户的记录。 */
export const findDatasetVectorData = (scope: { teamId: string; datasetId: string }) =>
  MongoDataset.findOne(
    { _id: scope.datasetId, teamId: scope.teamId, deleteTime: null },
    { vectorData: 1 }
  ).lean();

/** 更新指定提供商的索引状态；pending 必须匹配投递前的时间戳。 */
const updateDatasetIndexState = ({
  teamId,
  datasetId,
  state,
  field,
  expectedCheckedAt
}: {
  teamId: string;
  datasetId: string;
  state: NonNullable<DatasetVectorData['pgIndex']>;
  field: 'pgIndex' | 'openGaussIndex';
  expectedCheckedAt?: Date;
}) =>
  MongoDataset.updateOne(
    {
      _id: datasetId,
      teamId,
      deleteTime: null,
      ...(state === 'pending'
        ? {
            [`vectorData.${field}`]: { $nin: ['ready', 'building', 'removing', 'pending'] },
            [`vectorData.${field}CheckedAt`]: expectedCheckedAt ?? null
          }
        : {})
    },
    { $set: { [`vectorData.${field}`]: state, [`vectorData.${field}CheckedAt`]: new Date() } }
  );

type UpdateIndexStateParams = Omit<
  Parameters<typeof updateDatasetIndexState>[0],
  'state' | 'field'
> & {
  pgIndex: NonNullable<DatasetVectorData['pgIndex']>;
};

export const updateDatasetPgIndexState = ({ pgIndex, ...scope }: UpdateIndexStateParams) =>
  updateDatasetIndexState({ ...scope, state: pgIndex, field: 'pgIndex' });

export const updateDatasetOpenGaussIndexState = ({
  openGaussIndex,
  ...scope
}: Omit<UpdateIndexStateParams, 'pgIndex'> & {
  openGaussIndex: NonNullable<DatasetVectorData['openGaussIndex']>;
}) => updateDatasetIndexState({ ...scope, state: openGaussIndex, field: 'openGaussIndex' });

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
