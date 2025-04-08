import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';
import type { Mongoose } from 'mongoose';

const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));

/**
 * connect MongoDB and init data
 */
export async function connectMongo(db: Mongoose, url: string): Promise<Mongoose> {
  /* Connecting, connected will return */
  if (db.connection.readyState !== 0) {
    return db;
  }

  console.log('MongoDB start connect');
  try {
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
          await connectMongo(db, url);
        }
      } catch (error) {}
    });
    db.connection.on('disconnected', async () => {
      console.log('mongo disconnected');
      try {
        if (db.connection.readyState !== 0) {
          await db.disconnect();
          await delay(1000);
          await connectMongo(db, url);
        }
      } catch (error) {}
    });

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
    };

    db.connect(url, options);

    console.log('mongo connected');
    return db;
  } catch (error) {
    addLog.error('Mongo connect error', error);

    await db.disconnect();

    await delay(1000);
    return connectMongo(db, url);
  }
}
