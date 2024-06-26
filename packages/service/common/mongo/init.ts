import { addLog } from '../system/log';
import { connectionMongo } from './index';
import type { Mongoose } from 'mongoose';

const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));

/**
 * connect MongoDB and init data
 */
export async function connectMongo({
  beforeHook,
  afterHook
}: {
  beforeHook?: () => any;
  afterHook?: () => Promise<any>;
}): Promise<Mongoose> {
  if (connectionMongo.connection.readyState !== 0) {
    return connectionMongo;
  }

  beforeHook && beforeHook();

  console.log('mongo start connect');
  try {
    connectionMongo.set('strictQuery', true);

    connectionMongo.connection.on('error', (error) => {
      console.log('mongo error', error);
      connectionMongo.disconnect();
    });
    connectionMongo.connection.on('disconnected', () => {
      console.log('mongo disconnected');
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
    });

    console.log('mongo connected');
  } catch (error) {
    connectionMongo.disconnect();
    addLog.error('mongo connect error', error);
  }

  try {
    afterHook && (await afterHook());
  } catch (error) {
    addLog.error('mongo connect after hook error', error);
  }

  return connectionMongo;
}
