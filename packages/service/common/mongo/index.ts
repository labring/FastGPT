import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { getLogger, LogCategories } from '../logger';
import type { Model } from 'mongoose';
import mongoose, { Mongoose } from 'mongoose';

const logger = getLogger(LogCategories.INFRA.MONGO);

export default mongoose;
export * from 'mongoose';

export const MONGO_URL = process.env.MONGODB_URI as string;
export const MONGO_LOG_URL = (process.env.MONGODB_LOG_URI ?? process.env.MONGODB_URI) as string;

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

const addCommonMiddleware = (schema: mongoose.Schema) => {
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
          console.warn('MongoDB slow query (>2s)', getLogData());
        } else if (duration > 500) {
          console.warn('MongoDB slow query (>500ms)', getLogData());
        }
      }
      next();
    });

    // Convert _id to string
    schema.post(/^find/, function (docs) {
      if (!docs) return;

      const visited = new WeakSet();
      const convertObjectIds = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);

        // Convert _id
        if (obj._id && obj._id.toString) {
          obj._id = obj._id.toString();
        }

        // Convert ObjectId fields at current level
        Object.keys(obj).forEach((key) => {
          const val = obj[key];
          if (!val) return;

          if (val._bsontype === 'ObjectId') {
            obj[key] = val.toString();
          } else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
              const item = val[i];
              if (!item) continue;
              if (item._bsontype === 'ObjectId') {
                val[i] = item.toString();
              } else if (typeof item === 'object') {
                convertObjectIds(item);
              }
            }
          } else if (typeof val === 'object') {
            convertObjectIds(val);
          }
        });
      };

      if (Array.isArray(docs)) {
        docs.forEach((doc) => convertObjectIds(doc));
      } else {
        convertObjectIds(docs);
      }
    });
  });

  return schema;
};

export const getMongoModel = <T>(name: string, schema: mongoose.Schema): Model<T> => {
  if (connectionMongo.models[name]) return connectionMongo.models[name] as Model<T>;
  if (!isTestEnv) logger.debug('Loading MongoDB model', { modelName: name });
  addCommonMiddleware(schema);

  const model = connectionMongo.model(name, schema) as Model<T>;

  // Sync index
  syncMongoIndex(model);

  return model;
};

export const getMongoLogModel = <T>(name: string, schema: mongoose.Schema): Model<T> => {
  if (connectionLogMongo.models[name]) return connectionLogMongo.models[name] as Model<T>;
  logger.debug('Loading MongoDB log model', { modelName: name });

  const model = connectionLogMongo.model(name, schema) as Model<T>;

  // Sync index
  syncMongoIndex(model);

  return model;
};

const syncMongoIndex = async (model: Model<any>) => {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.SYNC_INDEX === '0' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    !MONGO_URL
  ) {
    return;
  }

  try {
    await model.syncIndexes({ background: true });
  } catch (error) {
    logger.error('Failed to sync MongoDB indexes', { modelName: model.modelName, error });
  }
};

export const ReadPreference = connectionMongo.mongo.ReadPreference;
