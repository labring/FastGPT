import mongoose, { Mongoose } from 'mongoose';

/**
 * 连接 MongoDB 数据库
 */
export async function connectToDatabase(): Promise<void> {
  if (global.mongodb) {
    return;
  }

  global.mongodb = 'connecting';
  console.log('connect mongo');
  try {
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      dbName: 'doc_gpt',
      maxPoolSize: 10,
      minPoolSize: 1
    });
  } catch (error) {
    console.error('mongo connect error');
    global.mongodb = null;
  }
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/model';
export * from './models/user';
export * from './models/training';
export * from './models/chatWindow';
