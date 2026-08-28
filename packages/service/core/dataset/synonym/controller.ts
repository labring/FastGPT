import { MongoDatasetSynonym, MongoDatasetSynonymMapping } from './schema';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from '../training/schema';

/** 获取当前同义词配置及其重建进度。 */
export const getDatasetSynonymDetail = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const [file, rebuildingData, training] = await Promise.all([
    MongoDatasetSynonym.findOne({ teamId, datasetId }).lean(),
    MongoDatasetData.exists({ teamId, datasetId, rebuilding: true }),
    MongoDatasetTraining.exists({ teamId, datasetId })
  ]);
  return {
    file: file ?? undefined,
    rebuilding: !!rebuildingData || !!training
  };
};

/** 分页搜索当前生效的 mappings。 */
export const searchDatasetSynonymMappings = async ({
  teamId,
  datasetId,
  search,
  pageNum,
  pageSize
}: {
  teamId: string;
  datasetId: string;
  search?: string;
  pageNum: number;
  pageSize: number;
}) => {
  const config = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
  if (!config?.enabled) return { total: 0, list: [] };
  const escapedSearch = search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = {
    teamId,
    datasetId,
    fileVersion: config.version,
    ...(escapedSearch ? { allTerms: { $regex: escapedSearch, $options: 'i' } } : {})
  };
  const [total, list] = await Promise.all([
    MongoDatasetSynonymMapping.countDocuments(match),
    MongoDatasetSynonymMapping.find(match)
      .sort({ normalizedStandardizedTerm: 1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  return { total, list };
};
