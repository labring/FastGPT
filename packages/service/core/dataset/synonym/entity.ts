import {
  DatasetSynonymLimits,
  type DatasetSynonymConfigType,
  type DatasetSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import {
  buildSynonymMatcher,
  type DatasetSynonymMatcher,
  type DatasetSynonymMatcherMapping
} from './utils';
import { MongoDatasetSynonym, MongoDatasetSynonymMapping } from './schema';

const matcherCacheMaxWeight = DatasetSynonymLimits.maxTotalTermCodePoints * 2;
const matcherCache = new Map<string, { matcher: DatasetSynonymMatcher; weight: number }>();
let matcherCacheWeight = 0;
const transformConfigCacheTtl = 5000;
const transformConfigCacheMaxSize = 1000;
const transformConfigCache = new Map<
  string,
  { expiresAt: number; promise: Promise<DatasetSynonymConfigType | null> }
>();

const getMatcherCacheKey = ({
  teamId,
  datasetId,
  fileVersion
}: {
  teamId: string;
  datasetId: string;
  fileVersion: number;
}) => `${teamId}:${datasetId}:${fileVersion}`;

/**
 * 合并短时间内同一知识库的转换配置读取，包括未配置结果。
 * 该缓存只生成 embedding 快照；提交前的版本校验始终直查 MongoDB。
 */
const getCachedDatasetSynonymConfig = ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const cacheKey = `${teamId}:${datasetId}`;
  const cached = transformConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = getDatasetSynonymConfig({ teamId, datasetId }).catch((error) => {
    if (transformConfigCache.get(cacheKey)?.promise === promise) {
      transformConfigCache.delete(cacheKey);
    }
    throw error;
  });
  transformConfigCache.delete(cacheKey);
  transformConfigCache.set(cacheKey, {
    expiresAt: Date.now() + transformConfigCacheTtl,
    promise
  });

  while (transformConfigCache.size > transformConfigCacheMaxSize) {
    const oldestKey = transformConfigCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    transformConfigCache.delete(oldestKey);
  }

  return promise;
};

const toMatcherMapping = (mapping: DatasetSynonymMappingType): DatasetSynonymMatcherMapping => ({
  logicalMappingId: String(mapping.logicalMappingId),
  datasetId: String(mapping.datasetId),
  fileVersion: mapping.fileVersion,
  standardizedTerm: mapping.standardizedTerm,
  normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
  synonymTerms: mapping.synonymTerms,
  normalizedSynonymTerms: mapping.normalizedSynonymTerms
});

/** 读取知识库同义词配置；未配置时返回 null。 */
export const getDatasetSynonymConfig = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DatasetSynonymConfigType | null> => {
  return MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
};

/** 读取指定不可变版本的 mappings，结果按标准词匹配键稳定排序。 */
export const getDatasetSynonymMappings = async ({
  teamId,
  datasetId,
  fileVersion
}: {
  teamId: string;
  datasetId: string;
  fileVersion: number;
}): Promise<DatasetSynonymMappingType[]> => {
  if (fileVersion <= 0) return [];

  return MongoDatasetSynonymMapping.find({ teamId, datasetId, fileVersion })
    .sort({ normalizedStandardizedTerm: 1 })
    .lean();
};

/**
 * 获取版本隔离的 matcher。缓存 key 包含团队、知识库和文件版本，版本切换不会
 * 原地修改已有 matcher，也不会把一个租户的词表暴露给另一个租户。
 */
export const getDatasetSynonymMatcher = async ({
  teamId,
  datasetId,
  fileVersion
}: {
  teamId: string;
  datasetId: string;
  fileVersion: number;
}): Promise<DatasetSynonymMatcher> => {
  const cacheKey = getMatcherCacheKey({ teamId, datasetId, fileVersion });
  const cached = matcherCache.get(cacheKey);
  if (cached) {
    matcherCache.delete(cacheKey);
    matcherCache.set(cacheKey, cached);
    return cached.matcher;
  }

  const mappings = await getDatasetSynonymMappings({ teamId, datasetId, fileVersion });
  const matcher = buildSynonymMatcher(mappings.map(toMatcherMapping));
  const weight = mappings.reduce(
    (sum, mapping) =>
      sum +
      Array.from(mapping.normalizedStandardizedTerm).length +
      mapping.normalizedSynonymTerms.reduce(
        (termSum, term) => termSum + Array.from(term).length,
        0
      ),
    0
  );
  matcherCacheWeight -= matcherCache.get(cacheKey)?.weight ?? 0;
  matcherCache.set(cacheKey, { matcher, weight });
  matcherCacheWeight += weight;

  while (matcherCacheWeight > matcherCacheMaxWeight && matcherCache.size > 1) {
    const oldestKey = matcherCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = matcherCache.get(oldestKey);
    matcherCache.delete(oldestKey);
    matcherCacheWeight -= oldest?.weight ?? 0;
  }

  return matcher;
};

/** 清理一个知识库的全部版本 matcher，用于删除知识库和回收旧版本。 */
export const invalidateDatasetSynonymMatcherCache = ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const prefix = `${teamId}:${datasetId}:`;
  transformConfigCache.delete(`${teamId}:${datasetId}`);
  for (const key of matcherCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    matcherCacheWeight -= matcherCache.get(key)?.weight ?? 0;
    matcherCache.delete(key);
  }
};

/** 返回当前已生效的 matcher；配置更新后立即用于查询和新写入。 */
export const getDatasetSynonymRuntimeConfig = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const config = await getDatasetSynonymConfig({ teamId, datasetId });
  if (!config) return null;

  const activeMatcher = config.enabled
    ? await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: config.version })
    : undefined;

  return {
    config,
    active: activeMatcher ? { version: config.version, matcher: activeMatcher } : undefined
  };
};

/**
 * 获取数据写入使用的文本转换上下文。原始数据保持不变，转换仅用于 embedding 输入。
 */
export const getDatasetSynonymTransformContext = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const config = await getCachedDatasetSynonymConfig({ teamId, datasetId });
  const matcher = config?.enabled
    ? await getDatasetSynonymMatcher({
        teamId,
        datasetId,
        fileVersion: config.version
      })
    : undefined;
  return {
    version: config?.version ?? 0,
    transformText: (text: string) => matcher?.transform(text).transformedText ?? text,
    /** 无配置和禁用状态同样参与快照校验，防止 embedding 期间启用新配置。 */
    isCurrent: async () => {
      const current = await getDatasetSynonymConfig({ teamId, datasetId });
      if (!config) return current === null;
      return current?.enabled === config.enabled && current.version === config.version;
    }
  };
};
