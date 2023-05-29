import mongoose from 'mongoose';
import tunnel from 'tunnel';
import { TrainingData } from './mongo';
import { startQueue } from './utils/tools';

/**
 * 连接 MongoDB 数据库
 */
export async function connectToDatabase(): Promise<void> {
  if (global.mongodb) {
    return;
  }

  global.mongodb = 'connecting';
  try {
    mongoose.set('strictQuery', true);
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      dbName: process.env.MONGODB_NAME,
      maxPoolSize: 5,
      minPoolSize: 1,
      maxConnecting: 5
    });
    console.log('mongo connected');
  } catch (error) {
    console.log('error->', 'mongo connect error');
    global.mongodb = null;
  }

  // 创建代理对象
  if (process.env.AXIOS_PROXY_HOST && process.env.AXIOS_PROXY_PORT) {
    global.httpsAgent = tunnel.httpsOverHttp({
      proxy: {
        host: process.env.AXIOS_PROXY_HOST,
        port: +process.env.AXIOS_PROXY_PORT
      }
    });
  }

  global.qaQueueLen = 0;
  global.vectorQueueLen = 0;

  startQueue();
  // 5 分钟后解锁不正常的数据，并触发开始训练
  setTimeout(async () => {
    await TrainingData.updateMany(
      {
        lockTime: { $lte: Date.now() - 5 * 60 * 1000 }
      },
      {
        lockTime: new Date('2000/1/1')
      }
    );
    startQueue();
  }, 5 * 60 * 1000);
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
