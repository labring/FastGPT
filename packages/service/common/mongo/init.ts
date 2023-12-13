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
    await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      maxConnecting: Number(process.env.DB_MAX_LINK || 5),
      maxPoolSize: Number(process.env.DB_MAX_LINK || 5),
      minPoolSize: Math.min(10, Number(process.env.DB_MAX_LINK || 10)),
      connectTimeoutMS: 60000,
      waitQueueTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      maxIdleTimeMS: 300000,
      retryWrites: true,
      retryReads: true
    });

    console.log('mongo connected');

    afterHook && (await afterHook());
  } catch (error) {
    global.mongodb.disconnect();
    console.log('error->', 'mongo connect error', error);
    global.mongodb = undefined;
  }
}
