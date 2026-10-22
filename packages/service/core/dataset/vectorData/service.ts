import type { DatasetVectorSearchData } from '@fastgpt/global/core/dataset/vectorData/type';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getVectorCount } from '../../../common/vectorDB/controller';
import { getVectorType } from '../../../common/vectorDB/constants';
import { findDatasetsVectorData } from './entity';

/** PG 检索每次只准备一次路由快照；冷计数最多并行四个，其他 provider 不增加统计开销。 */
export const getDatasetVectorSearchData = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<DatasetVectorSearchData[] | undefined> => {
  if (getVectorType() !== 'pg' || datasetIds.length === 0) return;
  const datasets = await findDatasetsVectorData({ teamId, datasetIds: [...new Set(datasetIds)] });
  return batchRun(
    datasets,
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
