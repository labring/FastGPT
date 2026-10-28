import { AsyncLocalStorage } from 'node:async_hooks';
import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { getLogger, LogCategories } from '../logger';
import { isProfiling, recordMongoOperation } from '../profiling';
import type {
  AnyBulkWriteOperation,
  ClientSession,
  Model,
  Mongoose as MongooseType,
  PipelineStage
} from 'mongoose';
import mongoose, { Mongoose } from 'mongoose';
import { serviceEnv } from '../../env';
import { MongoIndexManager } from './indexManager';

const logger = getLogger(LogCategories.INFRA.MONGO);

export default mongoose;
export { Schema, Types } from 'mongoose';
export type {
  AnyBulkWriteOperation,
  ClientSession,
  Model,
  MongooseType as Mongoose,
  PipelineStage
};

export const MONGO_URL = serviceEnv.MONGODB_URI;
export const MONGO_LOG_URL = serviceEnv.MONGODB_LOG_URI ?? serviceEnv.MONGODB_URI;

export const connectionMongo = (() => {
  if (!global.mongodb) {
    global.mongodb = new Mongoose();
  }
  return global.mongodb;
})();

export const connectionLogMongo = (() => {
  if (!global.mongodbLog) {
    global.mongodbLog = new Mongoose();
  }
  return global.mongodbLog;
})();

const installedSchemas = new WeakSet<mongoose.Schema>();

/**
 * 单次 Mongo 操作的起始时间。
 *
 * Model 级 middleware（如 insertMany）的 `this` 是所有调用共享的构造函数，
 * 不能把计时状态挂在上下文对象上；这里用 AsyncLocalStorage 按调用隔离，
 * 保证并发、逆序完成时每个操作都能拿到自己的起点。
 */
const operationStartStorage = new AsyncLocalStorage<number>();

/** 从 Query、Aggregate、Document 或 Model middleware 上下文解析集合名。 */
const getCollectionName = (context: any) => {
  try {
    if (typeof context?.model?.collection?.name === 'string') return context.model.collection.name;
    if (typeof context?._model?.collection?.name === 'string')
      return context._model.collection.name;
    if (typeof context?.$model === 'function') return context.$model()?.collection?.name;
    // Query 的 collection 是函数，函数的 name 不是集合名，只接受真实 collection 对象。
    if (context?.collection && typeof context.collection === 'object') {
      return context.collection.name;
    }
    if (typeof context?.model === 'function') return context.model()?.collection?.name;
    return context?.constructor?.collection?.name;
  } catch {
    return;
  }
};

/**
 * Converts top-level BSON ObjectId values in a query result to strings.
 *
 * This intentionally keeps the existing shallow conversion behavior. The
 * middleware is shared by all Mongo models, so recursively walking arbitrary
 * populated or aggregate-shaped values here would add an uncontrolled cost to
 * every matching query.
 */
const convertObjectIds = (obj: any) => {
  if (!obj) return;

  if (obj._id?._bsontype === 'ObjectId') {
    obj._id = obj._id.toString();
  }

  for (const key of Object.keys(obj)) {
    if (obj[key]?._bsontype === 'ObjectId') {
      obj[key] = obj[key].toString();
    }
  }
};

const addCommonMiddleware = (schema: mongoose.Schema) => {
  if (installedSchemas.has(schema)) return schema;

  const operations = [
    /^find/,
    'save',
    'create',
    /^update/,
    /^delete/,
    'aggregate',
    'count',
    'countDocuments',
    'estimatedDocumentCount',
    'distinct',
    'insertMany'
  ];

  /**
   * 取本次操作的起始时间。
   *
   * Query / Document 每次调用都是独立对象，直接读挂在自身上的 `_startTime`；
   * Model 级 middleware（如 insertMany）的 `this` 是所有调用共享的构造函数，
   * 只能通过 AsyncLocalStorage 按调用隔离，避免并发或逆序完成时互相覆盖。
   */
  const getOperationStartTime = (context: any): number | undefined =>
    typeof context === 'function' ? operationStartStorage.getStore() : context._startTime;

  /** 成功和失败 post hook 共用同一套耗时、慢查询与 profile 统计。 */
  const finishOperation = (context: any) => {
    const startedAt = getOperationStartTime(context);

    // 用完即清除实例上的计时状态。Mongoose 的内置校验在计时 pre hook 之前执行，
    // 同一个 Document 再次 save 若在本地校验阶段失败，错误 post hook 仍会触发，
    // 此时不能沿用上一次保存的起点，否则业务间隔会被算成 Mongo 耗时并触发慢查询告警。
    if (context && typeof context === 'object') {
      delete context._startTime;
    }

    if (startedAt === undefined) return;

    const duration = Date.now() - startedAt;
    const getLogData = () => {
      const collectionName = getCollectionName(context);
      const op = (() => {
        if (context.op) return context.op;
        if (context._pipeline) {
          return 'aggregate';
        }
        if (context.constructor?.name === 'model') {
          return 'save/create';
        }
        return context.constructor?.name || 'unknown';
      })();
      return {
        duration,
        collectionName,
        op,
        ...(context._query && { query: context._query }),
        ...(context._pipeline && { pipeline: context._pipeline }),
        ...(context._update && { update: context._update }),
        ...(context._delete && { delete: context._delete })
      };
    };

    if (duration > 2000) {
      logger.warn('MongoDB slow query (>2s)', getLogData());
    } else if (duration > 500) {
      logger.warn('MongoDB slow query (>500ms)', getLogData());
    }

    // 只有请求处于分段采集上下文时才统计，普通请求不受影响。
    if (isProfiling()) {
      recordMongoOperation({
        collectionName: getCollectionName(context),
        durationMs: duration
      });
    }
  };

  operations.forEach((op: any) => {
    schema.pre(op, function (this: any, next) {
      this._query = this.getQuery ? this.getQuery() : null;

      if (typeof this === 'function') {
        // Model 上下文共享，用 AsyncLocalStorage 在 next() 的执行链上携带本次起点。
        operationStartStorage.run(Date.now(), next);
        return;
      }

      this._startTime = Date.now();
      next();
    });

    schema.post(op, function (this: any, result: any, next) {
      finishOperation(this);
      next();
    });

    schema.post(op, function (this: any, error: any, result: any, next: any) {
      finishOperation(this);
      next(error);
    });
  });

  // Register the result transform once per Schema instead of once per timing operation.
  schema.post(/^find/, function (docs) {
    if (Array.isArray(docs)) {
      docs.forEach((doc) => convertObjectIds(doc));
    } else {
      convertObjectIds(docs);
    }
  });

  installedSchemas.add(schema);

  return schema;
};

export const getMongoModel = <T>(name: string, schema: mongoose.Schema): Model<T> => {
  if (connectionMongo.models[name]) return connectionMongo.models[name] as Model<T>;
  if (!isTestEnv) logger.debug('Loading MongoDB model', { modelName: name });
  addCommonMiddleware(schema);

  const model = connectionMongo.model(name, schema) as Model<T>;

  syncMongoIndex(model);

  return model;
};

export const getMongoLogModel = <T>(name: string, schema: mongoose.Schema): Model<T> => {
  if (connectionLogMongo.models[name]) return connectionLogMongo.models[name] as Model<T>;
  logger.debug('Loading MongoDB log model', { modelName: name });

  const model = connectionLogMongo.model(name, schema) as Model<T>;

  syncMongoIndex(model);

  return model;
};

const syncMongoIndex = (model: Model<any>) => {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    !serviceEnv.SYNC_INDEX ||
    !MONGO_URL
  ) {
    return;
  }

  void MongoIndexManager.syncModelIndexes({
    model,
    logger
  }).catch((error) => {
    logger.error('Failed to ensure MongoDB indexes', {
      modelName: model.modelName,
      collectionName: model.collection.collectionName,
      error
    });
  });
};

export const ReadPreference = connectionMongo.mongo.ReadPreference;

export { MongoIndexManager } from './indexManager';
export {
  getDeprecatedIndexes as getSchemaDeprecatedMongoIndexes,
  defineIndex
} from './schemaIndexes';
export type {
  MongoIndexCleanupAction,
  MongoIndexCleanupReport,
  MongoIndexCleanupReportItem,
  MongoIndexCleanupSummary,
  MongoIndexSyncResult
} from './indexManager';
export type {
  DefineMongoIndexOptions,
  DeprecatedMongoIndexDefinition,
  DeprecatedMongoIndexOptions
} from './schemaIndexes';
