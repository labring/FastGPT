import { addLog } from '@fastgpt/service/common/system/log';
import type { Model, Schema } from 'mongoose';
import { Mongoose } from 'mongoose';

export const MONGO_URL = process.env.MONGODB_URI ?? '';
const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));

declare global {
  var mongodb: Mongoose | undefined;
}

export const connectionMongo = (() => {
  if (!global.mongodb) {
    global.mongodb = new Mongoose();
  }
  return global.mongodb;
})();

export const getMongoModel = <T extends Schema>(name: string, schema: T) => {
  if (connectionMongo.models[name]) return connectionMongo.model<T>(name);
  addLog.info(`Load model: ${name}`);

  const model = connectionMongo.model(name, schema);

  syncMongoIndex(model);

  return model;
};

const syncMongoIndex = async (model: Model<any>) => {
  if (process.env.SYNC_INDEX !== '0' && process.env.NODE_ENV !== 'test') {
    try {
      model.syncIndexes({ background: true });
    } catch (error: any) {
      addLog.error('Create index error', error);
    }
  }
};

export const ReadPreference = connectionMongo.mongo.ReadPreference;

export async function connectMongo(db: Mongoose, url: string): Promise<Mongoose> {
  if (db.connection.readyState !== 0) {
    return db;
  }

  if (!url || typeof url !== 'string') {
    throw new Error(`Invalid MongoDB connection URL: ${url}`);
  }

  try {
    db.connection.removeAllListeners('error');
    db.connection.removeAllListeners('disconnected');
    db.set('strictQuery', 'throw');

    db.connection.on('error', async (error) => {
      console.error('mongo error', error);
    });
    db.connection.on('connected', async () => {
      console.log('mongo connected');
    });
    db.connection.on('disconnected', async () => {
      console.error('mongo disconnected');
    });

    await db.connect(url, {
      bufferCommands: true,
      maxConnecting: maxConnecting, // 最大连接数: 防止连接数过多时无法满足需求
      maxPoolSize: maxConnecting, // 最大连接池大小: 防止连接池过大时无法满足需求
      minPoolSize: 20, // 最小连接数: 20,防止连接数过少时无法满足需求
      connectTimeoutMS: 60000, // 连接超时: 60秒,防止连接失败时长时间阻塞
      waitQueueTimeoutMS: 60000, // 等待队列超时: 60秒,防止等待队列长时间阻塞
      socketTimeoutMS: 60000, // Socket 超时: 60秒,防止Socket连接失败时长时间阻塞
      maxIdleTimeMS: 300000, // 空闲连接超时: 5分钟,防止空闲连接长时间占用资源
      retryWrites: true, // 重试写入: 重试写入失败的操作
      retryReads: true, // 重试读取: 重试读取失败的操作
      serverSelectionTimeoutMS: 10000, // 服务器选择超时: 10秒,防止副本集故障时长时间阻塞
      heartbeatFrequencyMS: 5000 // 5s 进行一次健康检查
    });
    return db;
  } catch (error) {
    addLog.error('Mongo connect error', error);
    await db.disconnect();
    await delay(1000);
    return connectMongo(db, url);
  }
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
