import mongoose from 'mongoose';
import { generateQA } from './events/generateQA';
import { generateAbstract } from './events/generateAbstract';
import { generateVector } from './events/generateVector';

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
    mongoose.set('strictQuery', true);
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      dbName: process.env.NODE_ENV === 'development' ? 'doc_gpt_test' : 'doc_gpt',
      maxPoolSize: 5,
      minPoolSize: 1,
      maxConnecting: 5
    });
  } catch (error) {
    console.log('error->', 'mongo connect error');
    global.mongodb = null;
  }

  generateQA();
  // generateAbstract();
  generateVector(true);
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/model';
export * from './models/user';
export * from './models/training';
export * from './models/bill';
export * from './models/pay';
export * from './models/data';
export * from './models/dataItem';
export * from './models/splitData';
export * from './models/openapi';
