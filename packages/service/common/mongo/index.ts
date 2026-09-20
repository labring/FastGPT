import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { getLogger, LogCategories } from '../logger';
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

  operations.forEach((op: any) => {
    schema.pre(op, function (this: any, next) {
      this._startTime = Date.now();
      this._query = this.getQuery ? this.getQuery() : null;

      next();
    });

    schema.post(op, function (this: any, result: any, next) {
      if (this._startTime) {
        const duration = Date.now() - this._startTime;

        const getLogData = () => {
          const collectionName = this.model?.collection?.name || this._model?.collection?.name;
          const op = (() => {
            if (this.op) return this.op;
            if (this._pipeline) {
              return 'aggregate';
            }
            if (this.constructor?.name === 'model') {
              return 'save/create';
            }
            return this.constructor?.name || 'unknown';
          })();
          return {
            duration,
            collectionName,
            op,
            ...(this._query && { query: this._query }),
            ...(this._pipeline && { pipeline: this._pipeline }),
            ...(this._update && { update: this._update }),
            ...(this._delete && { delete: this._delete })
          };
        };

        if (duration > 2000) {
          logger.warn('MongoDB slow query (>2s)', getLogData());
        } else if (duration > 500) {
          logger.warn('MongoDB slow query (>500ms)', getLogData());
        }
      }
      next();
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
