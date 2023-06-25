import mongoose from 'mongoose';
import tunnel from 'tunnel';
import { startQueue } from './utils/tools';
import { updateSystemEnv } from '@/pages/api/system/updateEnv';

/**
 * 连接 MongoDB 数据库
 */
export async function connectToDatabase(): Promise<void> {
  if (global.mongodb) {
    return;
  }

  // init global data
  global.qaQueueLen = 0;
  global.vectorQueueLen = 0;
  global.systemEnv = {
    vectorMaxProcess: 10,
    qaMaxProcess: 10,
    pgIvfflatProbe: 10,
    sensitiveCheck: false
  };
  // proxy obj
  if (process.env.AXIOS_PROXY_HOST && process.env.AXIOS_PROXY_PORT) {
    global.httpsAgent = tunnel.httpsOverHttp({
      proxy: {
        host: process.env.AXIOS_PROXY_HOST,
        port: +process.env.AXIOS_PROXY_PORT
      }
    });
  }

  global.mongodb = 'connecting';
  try {
    mongoose.set('strictQuery', true);
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      dbName: process.env.MONGODB_NAME,
      maxConnecting: Number(process.env.DB_MAX_LINK || 5),
      maxPoolSize: Number(process.env.DB_MAX_LINK || 5),
      minPoolSize: 2
    });
    console.log('mongo connected');
  } catch (error) {
    console.log('error->', 'mongo connect error');
    global.mongodb = null;
  }

  // init function
  updateSystemEnv();
  startQueue();
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/model';
export * from './models/user';
export * from './models/bill';
export * from './models/pay';
export * from './models/trainingData';
export * from './models/openapi';
export * from './models/promotionRecord';
export * from './models/collection';
export * from './models/shareChat';
export * from './models/kb';
export * from './models/inform';
export * from './models/system';
export * from './models/image';
