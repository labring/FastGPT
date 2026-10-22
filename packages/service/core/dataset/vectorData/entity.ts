import type { DatasetVectorDataType } from '@fastgpt/global/core/dataset/vectorData/type';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ClientSession } from '../../../common/mongo';
import { MongoDataset } from '../schema';

/** 只统计仍存在的知识库；目录不承载向量，其他类型按向量库实际计数。 */
export const findDatasetForVectorRows = ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) =>
  MongoDataset.findOne({
    _id: datasetId,
    teamId,
    deleteTime: null,
    type: { $ne: DatasetTypeEnum.folder }
  })
    .select('_id')
    .lean();

/**
 * 首次完整初始化，后续仅回写行数，避免覆盖未来索引维护状态；不复活已删除知识库。
 * 旧快照只允许覆盖更早快照，进程接管后迟到的结果不能回退统计时间。
 */
export const updateDatasetVectorRows = async (
  {
    teamId,
    datasetId,
    snapshot
  }: {
    teamId: string;
    datasetId: string;
    snapshot: DatasetVectorDataType;
  },
  session?: ClientSession
) => {
  const filter = {
    _id: datasetId,
    teamId,
    deleteTime: null,
    type: { $ne: DatasetTypeEnum.folder }
  };
  const initialized = await MongoDataset.updateOne(
    { ...filter, vectorData: { $exists: false } },
    { $set: { vectorData: snapshot } },
    { session, runValidators: true }
  );
  if (initialized.matchedCount) return;

  await MongoDataset.updateOne(
    { ...filter, 'vectorData.rowsUpdatedAt': { $lte: snapshot.rowsUpdatedAt } },
    {
      $set: { 'vectorData.rows': snapshot.rows, 'vectorData.rowsUpdatedAt': snapshot.rowsUpdatedAt }
    },
    { session, runValidators: true }
  );
};
