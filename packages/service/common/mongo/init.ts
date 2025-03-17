import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';
import { connectionMongo } from './index';
import type { Mongoose } from 'mongoose';

const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));

/**
 * connect MongoDB and init data
 */
export async function connectMongo(): Promise<Mongoose> {
  /* Connecting, connected will return */
  if (connectionMongo.connection.readyState !== 0) {
    return connectionMongo;
  }

  console.log('mongo start connect');
  try {
    // Remove existing listeners to prevent duplicates
    connectionMongo.connection.removeAllListeners('error');
    connectionMongo.connection.removeAllListeners('disconnected');
    connectionMongo.set('strictQuery', 'throw');

    connectionMongo.connection.on('error', async (error) => {
      console.log('mongo error', error);
      try {
        if (connectionMongo.connection.readyState !== 0) {
          await connectionMongo.disconnect();
          await delay(1000);
          await connectMongo();
        }
      } catch (error) {}
    });
    connectionMongo.connection.on('disconnected', async () => {
      console.log('mongo disconnected');
      try {
        if (connectionMongo.connection.readyState !== 0) {
          await connectionMongo.disconnect();
          await delay(1000);
          await connectMongo();
        }
      } catch (error) {}
    });

    await connectionMongo.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      maxConnecting: maxConnecting,
      maxPoolSize: maxConnecting,
      minPoolSize: 20,
      connectTimeoutMS: 60000,
      waitQueueTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      maxIdleTimeMS: 300000,
      retryWrites: true,
      retryReads: true

      // readPreference: 'secondaryPreferred',
      // readConcern: { level: 'local' },
      // writeConcern: { w: 'majority', j: true }
    });

    console.log('mongo connected');
    return connectionMongo;
  } catch (error) {
    addLog.error('mongo connect error', error);
    await connectionMongo.disconnect();
    await delay(1000);
    return connectMongo();
  }
}
