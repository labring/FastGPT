import { isTestEnv } from '@fastgpt/global/common/system/constants';
import { addLog } from '../../common/system/log';
import type { Model } from 'mongoose';
import mongoose, { Mongoose } from 'mongoose';

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
        const warnLogData = {
          collectionName: this.collection?.name,
          op: this.op,
          ...(this._query && { query: this._query }),
          ...(this._update && { update: this._update }),
          ...(this._delete && { delete: this._delete }),
          duration
        };

        if (duration > 1000) {
          addLog.warn(`Slow operation ${duration}ms`, warnLogData);
        }
      }
      next();
    });

    // Convert _id to string
    schema.post(/^find/, function (docs) {
      if (!docs) return;

      const convertObjectIds = (obj: any) => {
        if (!obj) return;

        // Convert _id
        if (obj._id && obj._id.toString) {
          obj._id = obj._id.toString();
        }

        // Convert other ObjectId fields
        Object.keys(obj).forEach((key) => {
          if (obj[key] && obj[key]._bsontype === 'ObjectId') {
            obj[key] = obj[key].toString();
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

export const getMongoModel = <T>(name: string, schema: mongoose.Schema) => {
  if (connectionMongo.models[name]) return connectionMongo.models[name] as Model<T>;
  if (!isTestEnv) console.log('Load model======', name);
  addCommonMiddleware(schema);

  const model = connectionMongo.model<T>(name, schema);

  // Sync index
  syncMongoIndex(model);

  return model;
};

export const getMongoLogModel = <T>(name: string, schema: mongoose.Schema) => {
  if (connectionLogMongo.models[name]) return connectionLogMongo.models[name] as Model<T>;
  console.log('Load model======', name);
  // addCommonMiddleware(schema); 

  const model = connectionLogMongo.model<T>(name, schema);

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
    addLog.error('Create index error', error);
  }
};

export const ReadPreference = connectionMongo.mongo.ReadPreference;
