import mongoose from 'mongoose';
import type { Mongoose } from 'mongoose';

let cachedClient: Mongoose;

export async function connectToDatabase() {
  if (cachedClient && cachedClient.connection.readyState === 1) {
    return cachedClient;
  }

  cachedClient = await mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: 'doc_gpt'
  });

  return cachedClient;
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/model';
export * from './models/user';
export * from './models/training';
export * from './models/chatWindow';
