import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '../data/schema';
import { getDatasetSynonymRuntimeConfig } from '../synonym/entity';

/**
 * 为最终引用批量补充 chunk 级同义词元数据。版本选择遵循过渡期规则：只有数据明确
 * 写入 pendingVersion 时使用 pending matcher，否则统一按 active matcher 解释。
 */
export const attachSynonymMappingsToSearchResults = async (
  results: SearchDataResponseItemType[]
): Promise<SearchDataResponseItemType[]> => {
  if (results.length === 0) return results;
  const dataList = await MongoDatasetData.find({
    _id: { $in: results.map((item) => item.id) }
  })
    .select({
      _id: 1,
      teamId: 1,
      datasetId: 1,
      q: 1,
      a: 1,
      indexes: 1,
      synonymIndexVersion: 1
    })
    .lean();
  const dataMap = new Map(dataList.map((data) => [String(data._id), data]));
  const datasetKeys = Array.from(
    new Set(dataList.map((data) => `${data.teamId}:${data.datasetId}`))
  );
  const runtimeEntries = await Promise.all(
    datasetKeys.map(async (key) => {
      const [teamId, datasetId] = key.split(':');
      return [
        key,
        await getDatasetSynonymRuntimeConfig({ teamId: teamId!, datasetId: datasetId! })
      ] as const;
    })
  );
  const runtimeMap = new Map(runtimeEntries);

  return results.map((result) => {
    const data = dataMap.get(result.id);
    if (!data) return result;
    const runtime = runtimeMap.get(`${data.teamId}:${data.datasetId}`);
    const target =
      runtime?.pending && data.synonymIndexVersion === runtime.pending.version
        ? runtime.pending
        : runtime?.active;
    if (!target) return result;

    const text = [
      data.q,
      data.a,
      ...data.indexes
        .filter((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding)
        .map((index) => index.text)
    ]
      .filter(Boolean)
      .join('\n');
    const synonymMappings = target.matcher.transform(text).usedMappings;
    return synonymMappings.length > 0 ? { ...result, synonymMappings } : result;
  });
};
