import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '../data/schema';
import { formatDatasetDataTextValue } from '../data/controller';
import { getCachedDatasetSynonymConfig, getDatasetSynonymMatcher } from './entity';
import { buildSynonymMatcher, normalizeSynonymTerm, type DatasetSynonymMatcher } from './utils';

/**
 * 问题侧反向匹配的探针哨兵：把「标准词」插成同义词侧、标准词本身用哨兵占位，
 * 从而复用 matcher 的归一化与词边界语义判定标准词是否出现在正文里。
 * 哨兵字符不可能出现在正文中，避免与 no-op 标准词端子同节点互相遮蔽。
 */
const SYNONYM_TERM_PROBE_SENTINEL = '\u0000';
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
  results,
  queries = []
}: {
  teamId: string;
  datasetIds: string[];
  results: SearchDataResponseItemType[];
  /**
   * 本次检索的用户问题（含查询扩展/同义标准化的结果）。命中分块的正文可能只写标准词
   * （用户问「枕瓜」、分块正文写「冬瓜」），此时分块自身没有原词，回答模型缺少术语对齐
   * 信息；这里把「问题里的原词 → 标准词」并入命中分块，仅保留标准词确实出现在该分块
   * 正文中的映射，避免把无关分块也标上同一组对应关系。
   */
  queries?: string[];
}): Promise<SearchDataResponseItemType[]> => {
  // 1. 定义内部快照剥离工具；功能关闭时直接清理全部同义词字段并返回。
  // 上游可能已完成装饰且映射可信；只剥离内部快照 Symbol。
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
  // 问题侧映射按 matcher 缓存，避免每个分块重复扫描同一个问题
  const queryMappingsByMatcher = new Map<
    string,
    ReturnType<DatasetSynonymMatcher['transform']>['usedMappings']
  >();
  // 单标准词条 matcher 缓存（问题侧反向匹配的词边界判定用）
  const termMatchers = new Map<string, DatasetSynonymMatcher>();
  const queryText = queries
    .map((query) => query.trim())
    .filter(Boolean)
    .join('\n');

  return Promise.all(
    results.map(async (item: InternalSearchItem) => {
      // 幂等：已携带映射且归属本次授权知识库的结果直接透传，避免重复查库，
      // 或因正文已签名导致图片分块映射被抹掉。
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

        const chunkText = `${snapshot.q}\n${snapshot.a ?? ''}`;
        const { usedMappings: chunkMappings } = matcher.transform(chunkText, {
          preserveMatchedTermCase: true
        });
        // 问题侧映射：只保留标准词确实出现在本分块正文里的条目。
        // 例：用户问「枕瓜排骨汤」、命中分块正文只写「冬瓜」，仍然附上「枕瓜 → 冬瓜」，
        // 让回答模型能把问题措辞和引用内容对齐；无关分块不会拿到这组映射。
        if (queryText && !queryMappingsByMatcher.has(matcherKey)) {
          queryMappingsByMatcher.set(
            matcherKey,
            matcher.transform(queryText, { preserveMatchedTermCase: true }).usedMappings
          );
        }
        // 标准词在正文中的命中判断必须复用 matcher 的归一化与词边界语义，不能用
        // includes：大小写变体（「REFUND」vs「Refund」）会漏配，词中子串
        // （cat ⊂ concatenate）会误配。用「把标准词当作同义词侧」的单词条 matcher
        // 做命中判定，天然继承上述约定；按 matcher 版本+标准词缓存，避免重复建 trie。
        const queryMappings = (queryMappingsByMatcher.get(matcherKey) ?? []).filter((mapping) => {
          const termMatcherKey = `${matcherKey}:${mapping.standardizedTerm}`;
          let termMatcher = termMatchers.get(termMatcherKey);
          if (!termMatcher) {
            termMatcher = buildSynonymMatcher([
              {
                logicalMappingId: mapping.mappingId,
                datasetId: mapping.datasetId,
                fileVersion: mapping.fileVersion,
                // 标准词用哨兵占位：若把标准词同时插成同义词侧，它会与 no-op 的
                // 标准词端子落在同一 trie 节点、被先命中的 no-op 端子遮蔽（产出 0 命中）。
                standardizedTerm: SYNONYM_TERM_PROBE_SENTINEL,
                normalizedStandardizedTerm: SYNONYM_TERM_PROBE_SENTINEL,
                synonymTerms: [mapping.standardizedTerm],
                normalizedSynonymTerms: [normalizeSynonymTerm(mapping.standardizedTerm)]
              }
            ]);
            termMatchers.set(termMatcherKey, termMatcher);
          }
          return termMatcher.transform(chunkText).usedMappings.length > 0;
        });

        const mappings: Record<string, string> = Object.create(null);

        // 单分块最多保留 100 条映射，超出时按整条映射截断；分块侧映射优先于问题侧。
        let truncated = false;
        let mappingCount = 0;
        for (const mapping of [...chunkMappings, ...queryMappings]) {
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
