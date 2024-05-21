import mongoose from './index';

/**
 * connect MongoDB and init data
 */
export async function connectMongo({
  beforeHook,
  afterHook
}: {
  beforeHook?: () => any;
  afterHook?: () => any;
}): Promise<void> {
  if (global.mongodb) {
    return;
  }
  global.mongodb = mongoose;

  beforeHook && (await beforeHook());

  console.log('mongo start connect');
  try {
    mongoose.set('strictQuery', true);
    const maxConnecting = Math.max(30, Number(process.env.DB_MAX_LINK || 20));
    await mongoose.connect(process.env.MONGODB_URI as string, {
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

    mongoose.connection.on('error', (error) => {
      console.log('mongo error', error);
      global.mongodb?.disconnect();
      global.mongodb = undefined;
    });
    mongoose.connection.on('disconnected', () => {
      console.log('mongo disconnected');
      global.mongodb = undefined;
    });

    console.log('mongo connected');

    afterHook && (await afterHook());
  } catch (error) {
    global.mongodb.disconnect();
    console.log('error->', 'mongo connect error', error);
    global.mongodb = undefined;
  }
}
