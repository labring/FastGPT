import type {
  DatasetSynonymConfigType,
  DatasetSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { DatasetSynonymSchemaVersion } from '@fastgpt/global/core/dataset/synonym';
import {
  buildSynonymMatcher,
  type DatasetSynonymMatcher,
  type DatasetSynonymMatcherMapping
} from './utils';
import { MongoDatasetSynonym, MongoDatasetSynonymMapping } from './schema';

const matcherCacheMaxSize = 100;
const matcherCache = new Map<string, DatasetSynonymMatcher>();

const getMatcherCacheKey = ({
  teamId,
  datasetId,
  fileVersion
}: {
  teamId: string;
  datasetId: string;
  fileVersion: number;
}) => `${teamId}:${datasetId}:${fileVersion}`;

const toMatcherMapping = (mapping: DatasetSynonymMappingType): DatasetSynonymMatcherMapping => ({
  logicalMappingId: String(mapping.logicalMappingId),
  datasetId: String(mapping.datasetId),
  fileVersion: mapping.fileVersion,
  standardizedTerm: mapping.standardizedTerm,
  normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
  synonymTerms: mapping.synonymTerms,
  normalizedSynonymTerms: mapping.normalizedSynonymTerms
});

/** 阻止未执行停机迁移的旧配置被静默当成空同义词。 */
export const assertDatasetSynonymConfigMigrated = (
  config: DatasetSynonymConfigType | null | undefined
) => {
  if (config && config.schemaVersion !== DatasetSynonymSchemaVersion) {
    throw new Error('同义词数据尚未升级，请先运行 Mongo-only 升级脚本');
  }
};

/** 读取知识库同义词配置；未配置时返回 null。 */
export const getDatasetSynonymConfig = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DatasetSynonymConfigType | null> => {
  const config = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
  assertDatasetSynonymConfigMigrated(config);
  return config;
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
    return cached;
  }

  const mappings = await getDatasetSynonymMappings({ teamId, datasetId, fileVersion });
  const matcher = buildSynonymMatcher(mappings.map(toMatcherMapping));
  matcherCache.set(cacheKey, matcher);

  const oldestKey = matcherCache.keys().next().value as string | undefined;
  if (matcherCache.size > matcherCacheMaxSize && oldestKey) matcherCache.delete(oldestKey);

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
  for (const key of matcherCache.keys()) {
    if (key.startsWith(prefix)) matcherCache.delete(key);
  }
};

/**
 * 返回查询过渡期需要的 active/pending matcher。activeVersion 为 0 时不构建空
 * matcher；pending 仅在配置明确存在 pendingVersion 时返回。
 */
export const getDatasetSynonymRuntimeConfig = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const config = await getDatasetSynonymConfig({ teamId, datasetId });
  if (!config) return null;

  const [activeMatcher, pendingMatcher] = await Promise.all([
    config.activeVersion > 0
      ? getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: config.activeVersion })
      : undefined,
    config.pendingVersion
      ? getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: config.pendingVersion })
      : undefined
  ]);

  return {
    config,
    active: activeMatcher ? { version: config.activeVersion, matcher: activeMatcher } : undefined,
    pending:
      pendingMatcher && config.pendingVersion
        ? {
            version: config.pendingVersion,
            matcher: pendingMatcher
          }
        : undefined
  };
};

/**
 * 获取数据写入使用的文本转换上下文。未指定版本时使用 activeVersion；显式版本用于
 * synonym worker 构造 pending 派生索引，版本 0 表示恢复原文。
 */
export const getDatasetSynonymTransformContext = async ({
  teamId,
  datasetId,
  fileVersion
}: {
  teamId: string;
  datasetId: string;
  fileVersion?: number;
}) => {
  const config = await getDatasetSynonymConfig({ teamId, datasetId });
  const targetVersion = fileVersion ?? config?.activeVersion ?? 0;
  if (targetVersion <= 0) {
    return {
      fileVersion: 0,
      transformText: (text: string) => text
    };
  }

  const matcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: targetVersion });
  return {
    fileVersion: targetVersion,
    transformText: (text: string) => matcher.transform(text).transformedText
  };
};
