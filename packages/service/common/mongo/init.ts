import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';
import { connectionMongo, connectionLogMongo } from './index';
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

  console.log('MongoDB start connect');
  try {
    const listenerInit = (db: Mongoose) => {
      // Remove existing listeners to prevent duplicates
      db.connection.removeAllListeners('error');
      db.connection.removeAllListeners('disconnected');
      db.set('strictQuery', 'throw');

      db.connection.on('error', async (error) => {
        console.log('mongo error', error);
        try {
          if (db.connection.readyState !== 0) {
            await db.disconnect();
            await delay(1000);
            await connectMongo();
          }
        } catch (error) {}
      });
      db.connection.on('disconnected', async () => {
        console.log('mongo disconnected');
        try {
          if (db.connection.readyState !== 0) {
            await db.disconnect();
            await delay(1000);
            await connectMongo();
          }
        } catch (error) {}
      });
    };
    listenerInit(connectionMongo);
    listenerInit(connectionLogMongo);

    const options = {
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
    };
    console.log(process.env.MONGODB_LOG_URI ?? process.env.MONGODB_URI, 222222);
    await Promise.all([
      connectionMongo.connect(process.env.MONGODB_URI, options),
      connectionLogMongo.connect(process.env.MONGODB_LOG_URI ?? process.env.MONGODB_URI, options)
    ]);

    console.log('mongo connected');
    return connectionMongo;
  } catch (error) {
    addLog.error('mongo connect error', error);

    await Promise.all([connectionMongo.disconnect(), connectionLogMongo.disconnect()]);

    await delay(1000);
    return connectMongo();
  }
}
