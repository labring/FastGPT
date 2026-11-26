import type { DatasetVectorSearchData } from '@fastgpt/global/core/dataset/vectorData/type';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getVectorCount } from '../../../common/vectorDB/controller';
import { getVectorType } from '../../../common/vectorDB/constants';
import { findDatasetsVectorData } from './entity';
import { removePgDatasetIndex } from '../../../common/vectorDB/pg/datasetIndex';

/**
 * 物理删除知识库前同步清理 PG 专属索引，包括无效索引和缺少 Mongo 索引元数据的知识库。
 * 逐库等待 PG 维护锁并核验清理结果，失败上抛给删除队列；其他向量库无需额外操作。
 */
export const removeDatasetVectorIndexes = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  if (getVectorType() !== 'pg') return;
  for (const datasetId of new Set(datasetIds.map(String))) {
    await removePgDatasetIndex({ teamId: String(teamId), datasetId });
  }
};

/** PG 检索每次只准备一次路由快照；冷计数最多并行四个，其他 provider 不增加统计开销。 */
export const getDatasetVectorSearchData = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<DatasetVectorSearchData[] | undefined> => {
  if (getVectorType() !== 'pg' || datasetIds.length === 0) return;
  const uniqueDatasetIds = [...new Set(datasetIds.map(String))];
  const datasets = await findDatasetsVectorData({ teamId, datasetIds: uniqueDatasetIds });
  // Mongo/SQL 的 $in 查询在不同索引计划（如 { teamId: 1, updateTime: -1 }）下不保证返回顺序，按去重后的入参顺序稳定重排。
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  const orderedDatasets = uniqueDatasetIds
    .map((id) => datasetMap.get(id))
    .filter((dataset): dataset is (typeof datasets)[number] => dataset !== undefined);
  return batchRun(
    orderedDatasets,
    async (dataset) => {
      const datasetId = String(dataset._id);
      return {
        datasetId,
        rows: await getVectorCount({ teamId, datasetId }),
        pgIndex: dataset.vectorData?.pgIndex ?? 'none'
      };
    },
    4
  );
};
