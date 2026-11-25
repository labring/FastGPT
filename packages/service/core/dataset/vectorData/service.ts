import type { DatasetVectorSearchData } from '@fastgpt/global/core/dataset/vectorData/type';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getVectorCount } from '../../../common/vectorDB/controller';
import { getVectorType } from '../../../common/vectorDB/constants';
import { findDatasetsVectorData } from './entity';
import { removeOpenGaussDatasetIndex } from '../../../common/vectorDB/opengauss/datasetIndex';
import { removePgDatasetIndex } from '../../../common/vectorDB/pg/datasetIndex';

/**
 * 物理删除知识库前同步清理专属局部索引，包括无效索引和缺少 Mongo 索引元数据的知识库。
 * 逐库等待数据库维护锁并核验清理结果，失败上抛给删除队列；其他向量库无需额外操作。
 */
export const removeDatasetVectorIndexes = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  const provider = getVectorType();
  if (provider !== 'pg' && provider !== 'opengauss') return;
  const removeIndex = provider === 'pg' ? removePgDatasetIndex : removeOpenGaussDatasetIndex;
  for (const datasetId of new Set(datasetIds.map(String))) {
    await removeIndex({ teamId: String(teamId), datasetId });
  }
};

/** 使用局部索引的检索每次只准备一次路由快照；冷计数最多并行四个，其他 provider 不增加统计开销。 */
export const getDatasetVectorSearchData = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<DatasetVectorSearchData[] | undefined> => {
  const provider = getVectorType();
  if ((provider !== 'pg' && provider !== 'opengauss') || datasetIds.length === 0) return;
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
        ...(provider === 'pg'
          ? { pgIndex: dataset.vectorData?.pgIndex ?? 'none' }
          : { openGaussIndex: dataset.vectorData?.openGaussIndex ?? 'none' })
      };
    },
    4
  );
};
