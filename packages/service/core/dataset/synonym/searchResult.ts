import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '../data/schema';
import { formatDatasetDataTextValue } from '../data/controller';
import { getDatasetSynonymMatcher, isDatasetSynonymEnabled } from './entity';
import { getLogger, LogCategories } from '../../../common/logger';

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
const logger = getLogger(LogCategories.SYSTEM);

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
  const cleanItem = (item: InternalSearchItem) => {
    const {
      [searchSynonymSnapshot]: snapshot,
      synonymMappings,
      synonymMappingsTruncated,
      ...clean
    } = item;
    return clean;
  };
  if (!isDatasetSynonymEnabled()) return results.map(cleanItem);
  const unresolvedIds = [
    ...new Set(
      results
        .filter(
          (item: InternalSearchItem) =>
            !item[searchSynonymSnapshot] && /^[a-f\d]{24}$/i.test(item.id)
        )
        .map((item) => item.id)
    )
  ];
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
      for (const row of rows) {
        const formatted = formatDatasetDataTextValue(row);
        for (const item of results.filter((item) => item.id === String(row._id))) {
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
      }
    } catch {
      logger.warn('Could not resolve synonym search snapshots', { count: unresolvedIds.length });
    }
  }
  const matchers = new Map<string, ReturnType<typeof getDatasetSynonymMatcher>>();
  return Promise.all(
    results.map(async (item: InternalSearchItem) => {
      const clean = cleanItem(item);
      const snapshot = item[searchSynonymSnapshot] ?? snapshots.get(item);
      if (!snapshot || snapshot.teamId !== teamId || !datasetIds.includes(snapshot.datasetId))
        return clean;
      if (!snapshot.synonymVersion) return { ...clean, synonymMappings: {} };
      try {
        const key = `${snapshot.datasetId}:${snapshot.synonymVersion}`;
        if (!matchers.has(key))
          matchers.set(
            key,
            getDatasetSynonymMatcher({
              teamId,
              datasetId: snapshot.datasetId,
              fileVersion: snapshot.synonymVersion
            })
          );
        const matcher = await matchers.get(key)!;
        if (!matcher.hasMappings) {
          logger.warn('Synonym search snapshot is unavailable');
          return clean;
        }
        const { usedMappings } = matcher.transform(`${snapshot.q}\n${snapshot.a ?? ''}`, {
          preserveMatchedTermCase: true
        });
        const mappings: Record<string, string> = Object.create(null);
        // Cap each chunk at 100 mappings / 16 KiB of JSON; never split a mapping value.
        // The flag tells UI/Agent that omitted terms may still match, not that lookup failed.
        let truncated = false;
        for (const mapping of usedMappings) {
          if (Object.hasOwn(mappings, mapping.matchedTerm)) continue;
          if (Object.keys(mappings).length >= 100) {
            truncated = true;
            break;
          }
          mappings[mapping.matchedTerm] = mapping.standardizedTerm;
          if (Buffer.byteLength(JSON.stringify(mappings), 'utf8') > 16 * 1024) {
            delete mappings[mapping.matchedTerm];
            truncated = true;
            break;
          }
        }
        if (truncated)
          logger.warn('Synonym search mappings truncated', { count: Object.keys(mappings).length });
        return {
          ...clean,
          synonymMappings: mappings,
          ...(truncated ? { synonymMappingsTruncated: true } : {})
        };
      } catch {
        logger.warn('Could not enrich synonym search result');
        return clean;
      }
    })
  );
};
