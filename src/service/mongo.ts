import mongoose from 'mongoose';

/**
 * 连接 MongoDB 数据库
 */
export async function connectToDatabase(): Promise<void> {
  // @ts-ignore
  if (global.mongodb) {
    return;
  }
  // @ts-ignore
  global.mongodb = 'connecting';
  console.log('connect mongo');
  try {
    // @ts-ignore
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      dbName: 'doc_gpt',
      maxPoolSize: 10,
      minPoolSize: 1
    });
  } catch (error) {
    console.error('mongo connect error');
    // @ts-ignore
    global.mongodb = null;
  }
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/model';
export * from './models/user';
export * from './models/training';
export * from './models/chatWindow';
