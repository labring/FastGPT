import { rebuildingDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import type { ClientSession } from '../../../common/mongo';
import { normalizePagination } from '../../../common/api/pagination';
import { MongoDatasetSynonym, MongoDatasetSynonymMapping } from './schema';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from '../training/schema';
import { assertDatasetSynonymEnabled, invalidateDatasetSynonymMatcherCache } from './entity';
import { serviceEnv } from '../../../env';

/** 所有数据追上当前词表后才回收历史版本；失败或在途数据仍需要旧快照重试。 */
export const cleanupUnusedDatasetSynonymMappings = async (
  { teamId, datasetId }: { teamId: string; datasetId: string },
  session?: ClientSession
) => {
  if (!serviceEnv.DATASET_SYNONYM_ENABLED) return;
  const config = await MongoDatasetSynonym.findOne({ teamId, datasetId }, null, { session }).lean();
  if (!config) return;
  const historicalData = await MongoDatasetData.exists({
    teamId,
    datasetId,
    synonymVersion: { $ne: config.version }
  }).session(session ?? null);
  if (historicalData) return;

  const { deletedCount } = await MongoDatasetSynonymMapping.deleteMany(
    { teamId, datasetId, fileVersion: { $lt: config.version } },
    { session }
  );
  if (deletedCount) invalidateDatasetSynonymMatcherCache({ teamId, datasetId });

  // 数据都已追上当前版本，更早的空词表版本不会再被引用，顺手回收。
  // 写入带读取时版本条件、且只 $pull 旧标记：清理与删除词表事务并发交错时
  // （旧清理读到 v3、删除事务随后提交 v4 并登记空版本 4），无条件覆盖会用 v3
  // 的旧数组吞掉 v4 的新标记——标记丢失会让 v5 重建无法识别 v4 向量来自原文，
  // 触发全量重算并刷新更新时间，抵消差量重建修复。
  const staleMarkers = (config.emptyVersions ?? []).filter(
    (version) => version !== config.version
  );
  if (staleMarkers.length > 0) {
    await MongoDatasetSynonym.updateOne(
      { _id: config._id, version: config.version },
      { $pull: { emptyVersions: { $in: staleMarkers } } },
      { session }
    );
  }
};

/**
 * 获取当前同义词配置及其重建进度。
 * 进度直接由 data 的重建状态和关联 training 派生，不维护第二份状态表；
 * 管理页面只需读取该接口，无需引擎提供专用进度 API 或状态字段。
 */
export const getDatasetSynonymDetail = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  assertDatasetSynonymEnabled();

  const [file, rebuildingData, training] = await Promise.all([
    MongoDatasetSynonym.findOne({ teamId, datasetId }).lean(),
    MongoDatasetData.exists({ teamId, datasetId, ...rebuildingDatasetDataMatch }),
    MongoDatasetTraining.exists({ teamId, datasetId })
  ]);
  return {
    file: file ?? undefined,
    rebuilding: !!rebuildingData || !!training
  };
};

/** 分页搜索当前生效的 mappings；offset（包含 0）优先，否则按页码定位，默认第一页。 */
export const searchDatasetSynonymMappings = async ({
  teamId,
  datasetId,
  search,
  pageNum,
  pageSize,
  offset
}: {
  teamId: string;
  datasetId: string;
  search?: string;
  pageNum?: number;
  pageSize: number;
  offset?: number;
}) => {
  assertDatasetSynonymEnabled();
  const { offset: skip } = normalizePagination({ pageSize, pageNum, offset });

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
      .skip(skip)
      .limit(pageSize)
      .lean()
  ]);
  return { total, list };
};
