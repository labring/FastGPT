import type { MongoIndexSyncMode } from '@fastgpt/global/common/system/constants';
import { getLogger, LogCategories } from '../logger';
import type { Model } from 'mongoose';

const defaultLogger = getLogger(LogCategories.INFRA.MONGO);

type MongoIndexLogger = {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
};

type MongooseDiffIndexesResult = {
  toDrop: string[];
  toCreate: unknown[];
};

export type MongoIndexSyncResult = {
  mode: MongoIndexSyncMode;
  modelName: string;
  collectionName: string;
  toDrop: string[];
  toCreate: unknown[];
};

const getCollectionName = (model: Model<any>) => model.collection.collectionName;

/**
 * 只计算当前 schema 和数据库索引的差异，不创建也不删除任何索引。
 *
 * `toDrop` 只表示 Mongoose 认为 schema 外存在的索引。默认安全模式下这些索引
 * 只会被记录为未知索引，不会删除，以保护客户自建索引。
 */
export const inspectMongoModelIndexes = async (
  model: Model<any>
): Promise<Pick<MongoIndexSyncResult, 'modelName' | 'collectionName' | 'toDrop' | 'toCreate'>> => {
  const diff = (await model.diffIndexes({
    indexOptionsToCreate: true
  })) as MongooseDiffIndexesResult;

  return {
    modelName: model.modelName,
    collectionName: getCollectionName(model),
    toDrop: diff.toDrop,
    toCreate: diff.toCreate
  };
};

/**
 * 按配置模式处理单个 Mongoose model 的索引。
 *
 * 默认 `create` 只创建 schema 中缺失的索引，并保留所有 schema 外索引。
 */
export const runMongoIndexSyncForModel = async ({
  model,
  mode,
  logger = defaultLogger
}: {
  model: Model<any>;
  mode: MongoIndexSyncMode;
  logger?: MongoIndexLogger;
}): Promise<MongoIndexSyncResult> => {
  const baseResult = {
    mode,
    modelName: model.modelName,
    collectionName: getCollectionName(model),
    toDrop: [],
    toCreate: []
  } satisfies MongoIndexSyncResult;

  if (mode === 'off') {
    return baseResult;
  }

  const inspection = await inspectMongoModelIndexes(model);
  const result: MongoIndexSyncResult = {
    ...baseResult,
    toDrop: inspection.toDrop,
    toCreate: inspection.toCreate
  };

  if (result.toDrop.length > 0) {
    logger.warn('Detected MongoDB indexes not declared by FastGPT schema', {
      mode,
      modelName: model.modelName,
      collectionName: getCollectionName(model),
      indexes: result.toDrop
    });
  }

  if (mode === 'dryRun') {
    logger.info('MongoDB index dry-run completed', result);
    return result;
  }

  await model.createIndexes({ background: true });

  logger.info('MongoDB indexes ensured', {
    mode,
    modelName: model.modelName,
    collectionName: getCollectionName(model),
    toCreateCount: result.toCreate.length
  });

  return result;
};
