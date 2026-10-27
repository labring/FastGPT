import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '../data/schema';
import { formatDatasetDataTextValue } from '../data/controller';
import { getCachedDatasetSynonymConfig, getDatasetSynonymMatcher } from './entity';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';

export const searchSynonymSnapshot = Symbol('searchSynonymSnapshot');
export type SearchSynonymSnapshot = {
  teamId: string;
  datasetId: string;
  synonymVersion?: number;
  q: string;
  a?: string;
};
type InternalSearchItem = SearchDataResponseItemType & {
  [searchSynonymSnapshot]?: SearchSynonymSnapshot;
};

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

/** 只装饰可靠的分块快照；外部结果按租户和知识库回查，失败不冒充未命中。 */
export const attachSynonymMappingsToSearchResults = async ({
  teamId,
  datasetIds,
  results
}: {
  teamId: string;
  datasetIds: string[];
  results: SearchDataResponseItemType[];
}): Promise<SearchDataResponseItemType[]> => {
  // 1. 定义内部快照剥离工具；功能关闭时直接清理全部同义词字段并返回。
  // 上游（如 Deep RAG 经 pro 返回）可能已完成装饰且映射可信；只剥离内部快照 Symbol。
  const stripInternalSnapshot = (item: InternalSearchItem): SearchDataResponseItemType => {
    const { [searchSynonymSnapshot]: snapshot, ...clean } = item;
    return clean;
  };
  const cleanItem = (item: InternalSearchItem): SearchDataResponseItemType => {
    const { synonymMappings, ...clean } = stripInternalSnapshot(item);
    return clean;
  };
  if (!serviceEnv.DATASET_SYNONYM_ENABLED) return results.map(cleanItem);

  // 2. 收集缺少内部快照且未预装饰的外部结果，按租户和授权知识库回查快照并校验正文一致性。
  const unresolvedItems = results.filter(
    (item: InternalSearchItem) =>
      item.synonymMappings === undefined &&
      !item[searchSynonymSnapshot] &&
      /^[a-f\d]{24}$/i.test(item.id)
  );
  const unresolvedIds = [...new Set(unresolvedItems.map((item) => item.id))];
  const snapshots = new Map<SearchDataResponseItemType, SearchSynonymSnapshot>();

  if (unresolvedIds.length) {
    try {
      const rows = await MongoDatasetData.find({
        teamId,
        datasetId: { $in: datasetIds },
        _id: { $in: unresolvedIds }
      })
        .select('_id teamId datasetId synonymVersion q a imageDescMap updateTime')
        .lean();
      const rowsById = new Map(rows.map((row) => [String(row._id), row]));

      for (const item of unresolvedItems) {
        const row = rowsById.get(item.id);
        if (!row) continue;

        const formatted = formatDatasetDataTextValue(row);
        if (
          item.q === formatted.q &&
          (item.a ?? '') === (formatted.a ?? '') &&
          new Date(item.updateTime).getTime() === new Date(row.updateTime).getTime()
        ) {
          snapshots.set(item, {
            teamId: String(row.teamId),
            datasetId: String(row.datasetId),
            synonymVersion: row.synonymVersion,
            q: row.q,
            a: row.a
          });
        }
      }
    } catch {
      logger.warn('Could not resolve synonym search snapshots', { count: unresolvedIds.length });
    }
  }

  // 3. 按词表版本缓存 matcher，逐条装饰结果；已装饰的授权条目幂等透传。
  const matchers = new Map<string, ReturnType<typeof getDatasetSynonymMatcher>>();

  return Promise.all(
    results.map(async (item: InternalSearchItem) => {
      // 幂等：已携带映射且归属本次授权知识库的结果视为可信装饰，直接透传。否则 Deep RAG 会对
      // searchDatasetData 的已装饰结果重复查库，且正文已签名导致图片分块映射被抹掉。
      // 越界结果不采信外部映射，走下方回溯逻辑后按普通条目处理。
      if (item.synonymMappings !== undefined && datasetIds.includes(item.datasetId)) {
        return stripInternalSnapshot(item);
      }

      const clean = cleanItem(item);
      const snapshot = item[searchSynonymSnapshot] ?? snapshots.get(item);
      if (!snapshot || snapshot.teamId !== teamId || !datasetIds.includes(snapshot.datasetId)) {
        return clean;
      }
      if (!snapshot.synonymVersion) return { ...clean, synonymMappings: {} };

      try {
        const matcherKey = `${snapshot.datasetId}:${snapshot.synonymVersion}`;
        if (!matchers.has(matcherKey)) {
          matchers.set(
            matcherKey,
            getDatasetSynonymMatcher({
              teamId,
              datasetId: snapshot.datasetId,
              fileVersion: snapshot.synonymVersion
            })
          );
        }

        const matcher = await matchers.get(matcherKey)!;
        if (!matcher.hasMappings) {
          // 删除/清空词表会推进到 enabled=false 的新版本且 mappings 为 0 条：
          // 与当前配置版本一致时是可靠的空映射，不能按"快照不可用"告警。
          const config = await getCachedDatasetSynonymConfig({
            teamId,
            datasetId: snapshot.datasetId
          });
          if (config && !config.enabled && config.version === snapshot.synonymVersion) {
            return { ...clean, synonymMappings: {} };
          }
          logger.warn('Synonym search snapshot is unavailable');
          return clean;
        }

        const { usedMappings } = matcher.transform(`${snapshot.q}\n${snapshot.a ?? ''}`, {
          preserveMatchedTermCase: true
        });
        const mappings: Record<string, string> = Object.create(null);

        // 单分块最多保留 100 条映射，超出时按整条映射截断。
        let truncated = false;
        let mappingCount = 0;
        for (const mapping of usedMappings) {
          if (Object.hasOwn(mappings, mapping.matchedTerm)) continue;
          if (mappingCount >= 100) {
            truncated = true;
            break;
          }

          mappings[mapping.matchedTerm] = mapping.standardizedTerm;
          mappingCount += 1;
        }

        if (truncated) logger.warn('Synonym search mappings truncated', { count: mappingCount });
        return {
          ...clean,
          synonymMappings: mappings
        };
      } catch {
        logger.warn('Could not enrich synonym search result');
        return clean;
      }
    })
  );
};
