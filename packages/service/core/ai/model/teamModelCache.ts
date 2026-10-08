import { cloneDeep } from 'lodash-es';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  SystemModelDataSchema,
  SystemModelDocumentDataSchema,
  type SystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/model/pricing';
import { getModelProvider } from './provider/controller';
import { MongoAIModel } from './schema';
import { Types } from '../../../common/mongo';
import { SimpleLRUCache } from '../../../common/cache/simpleLru';

/** 将 Mongo 数据库存储的原始模型文档转换为标准运行时 SystemModelDataType 对象 */
export const formatDbModelToRuntimeModel = (
  dbModel: Record<string, any>,
  language = 'en'
): SystemModelDataType => {
  const dbDocument = SystemModelDocumentDataSchema.parse(dbModel);
  let provider = defaultProvider;
  try {
    provider = getModelProvider(dbDocument.provider, language) ?? defaultProvider;
  } catch {
    provider = defaultProvider;
  }
  const runtimeModel = SystemModelDataSchema.parse({
    ...dbDocument,
    modelId: String(dbModel._id),
    provider: provider?.id ?? dbDocument.provider,
    avatar: provider?.avatar ?? ''
  });
  if (runtimeModel.type === ModelTypeEnum.llm) {
    runtimeModel.priceTiers = getRuntimeResolvedPriceTiers(runtimeModel);
  }
  return runtimeModel;
};

// 团队模型 LRU 缓存实例：容量 1000，默认 TTL 30 分钟
const teamModelsCache = new SimpleLRUCache<
  string,
  { models: SystemModelDataType[]; version: number }
>(1000, 30 * 60 * 1000);
const tmbModelsCache = new SimpleLRUCache<
  string,
  { models: SystemModelDataType[]; version: number }
>(1000, 30 * 60 * 1000);
const modelByIdCache = new SimpleLRUCache<string, { model: SystemModelDataType; version: number }>(
  1000,
  30 * 60 * 1000
);
// 团队与成员版本号 LRU 映射：容量 1000，默认 TTL 24 小时，防止超大规模租户长期累积造成内存无界膨胀
const teamVersions = new SimpleLRUCache<string, number>(1000, 24 * 60 * 60 * 1000);
const tmbVersions = new SimpleLRUCache<string, number>(1000, 24 * 60 * 60 * 1000);

/** 获取指定团队的当前内部修订版本号 */
export const getTeamModelVersion = (teamId: string): number => teamVersions.get(teamId) ?? 0;

/** 获取指定成员的当前内部修订版本号 */
export const getTmbModelVersion = (tmbId: string): number => tmbVersions.get(tmbId) ?? 0;

/**
 * 失效团队模型缓存。支持同时指定 teamId（失效整团队列表与递增版本号）、tmbId 或 modelId（失效单个模型条目）。
 */
export const invalidateTeamModelCache = ({
  teamId,
  modelId,
  tmbId
}: {
  teamId?: string;
  modelId?: string;
  tmbId?: string;
} = {}): void => {
  let resolvedTeamId: string | undefined = teamId;
  let resolvedTmbId: string | undefined = tmbId;
  if ((!resolvedTeamId || !resolvedTmbId) && modelId) {
    const cachedModel = modelByIdCache.get(modelId)?.model;
    if (!resolvedTeamId) resolvedTeamId = cachedModel?.teamId ?? undefined;
    if (!resolvedTmbId) resolvedTmbId = cachedModel?.tmbId ?? undefined;
  }
  if (resolvedTeamId) {
    const nextVer = (teamVersions.get(resolvedTeamId) ?? 0) + 1;
    teamVersions.set(resolvedTeamId, nextVer);
    teamModelsCache.delete(resolvedTeamId);
  }
  if (resolvedTmbId) {
    const nextVer = (tmbVersions.get(resolvedTmbId) ?? 0) + 1;
    tmbVersions.set(resolvedTmbId, nextVer);
    tmbModelsCache.delete(resolvedTmbId);
  }
  if (modelId) {
    modelByIdCache.delete(modelId);
  }
};

/** 清空全部团队模型 LRU 缓存与版本号（主要用于集成测试重置） */
export const clearTeamModelCache = (): void => {
  teamModelsCache.clear();
  tmbModelsCache.clear();
  modelByIdCache.clear();
  teamVersions.clear();
  tmbVersions.clear();
};

/**
 * 异步按团队 ID 查询团队模型列表，优先走 LRU 缓存，未命中时查询 Mongo 并缓存。
 */
export const getTeamModelsByTeamId = async (
  teamId: string,
  language = 'en'
): Promise<SystemModelDataType[]> => {
  if (!teamId || !Types.ObjectId.isValid(teamId)) return [];

  const currentVersion = getTeamModelVersion(teamId);
  const cached = teamModelsCache.get(teamId);
  if (cached && cached.version === currentVersion) {
    return cloneDeep(cached.models);
  }

  const dbModels = await MongoAIModel.find({
    scope: ModelScopeEnum.team,
    teamId
  })
    .sort({ _id: -1 })
    .lean();

  const models = dbModels.map((item) => formatDbModelToRuntimeModel(item, language));
  teamModelsCache.set(teamId, { models, version: currentVersion });

  models.forEach((model) => {
    modelByIdCache.set(model.modelId, { model, version: currentVersion });
  });

  return cloneDeep(models);
};

/**
 * 异步按成员 ID (tmbId) 查询成员拥有的团队模型列表，优先走 LRU 缓存，未命中时查询 Mongo 并缓存。
 */
export const getTeamModelsByTmbId = async (
  tmbId: string,
  language = 'en'
): Promise<SystemModelDataType[]> => {
  if (!tmbId || !Types.ObjectId.isValid(tmbId)) return [];

  const currentVersion = getTmbModelVersion(tmbId);
  const cached = tmbModelsCache.get(tmbId);
  if (cached && cached.version === currentVersion) {
    return cloneDeep(cached.models);
  }

  const dbModels = await MongoAIModel.find({
    scope: ModelScopeEnum.team,
    tmbId
  })
    .sort({ _id: -1 })
    .lean();

  const models = dbModels.map((item) => formatDbModelToRuntimeModel(item, language));
  tmbModelsCache.set(tmbId, { models, version: currentVersion });

  models.forEach((model) => {
    modelByIdCache.set(model.modelId, { model, version: currentVersion });
  });

  return cloneDeep(models);
};

/**
 * 异步按 modelId 获取单个团队模型，优先走 LRU 缓存，未命中时查询 Mongo 并缓存。
 */
export const getTeamModelById = async (
  modelId: string,
  language = 'en'
): Promise<SystemModelDataType | undefined> => {
  if (!modelId || !Types.ObjectId.isValid(modelId)) return undefined;

  const cached = modelByIdCache.get(modelId);
  if (cached) {
    const currentVersion = cached.model.teamId ? getTeamModelVersion(cached.model.teamId) : 0;
    if (cached.version === currentVersion) {
      return cloneDeep(cached.model);
    }
  }

  const dbModel = await MongoAIModel.findOne({
    _id: modelId,
    scope: ModelScopeEnum.team
  }).lean();

  if (!dbModel) return undefined;

  const model = formatDbModelToRuntimeModel(dbModel, language);
  const currentVersion = model.teamId ? getTeamModelVersion(model.teamId) : 0;
  modelByIdCache.set(modelId, { model, version: currentVersion });

  return cloneDeep(model);
};

/**
 * 同步从 LRU 内存缓存中获取单个团队模型（用于同步代码路径快查）。未缓存时返回 undefined。
 */
export const getTeamModelByIdSync = (modelId: string): SystemModelDataType | undefined => {
  if (!modelId || !Types.ObjectId.isValid(modelId)) return undefined;

  const cached = modelByIdCache.get(modelId);
  if (cached) {
    const currentVersion = cached.model.teamId ? getTeamModelVersion(cached.model.teamId) : 0;
    if (cached.version === currentVersion) {
      return cloneDeep(cached.model);
    }
  }
  return undefined;
};
