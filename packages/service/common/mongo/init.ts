import mongoose from './index';
import { createLogger, format, transports } from 'winston';
import 'winston-mongodb';

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
      minPoolSize: Number(process.env.DB_MAX_LINK || 10) * 0.5,
      connectTimeoutMS: 60000,
      waitQueueTimeoutMS: 60000
    });

    console.log('mongo connected');
    initLogger();

    afterHook && (await afterHook());
  } catch (error) {
    global.mongodb.disconnect();
    console.log('error->', 'mongo connect error', error);
    global.mongodb = undefined;
  }
}

function initLogger() {
  global.logger = createLogger({
    transports: [
      new transports.MongoDB({
        db: process.env.MONGODB_URI as string,
        collection: 'server_logs',
        options: {
          useUnifiedTopology: true
        },
        cappedSize: 500000000,
        tryReconnect: true,
        metaKey: 'meta',
        format: format.combine(format.timestamp(), format.json())
      }),
      new transports.Console({
        format: format.combine(
          format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          format.printf((info) => {
            if (info.level === 'error') {
              console.log(info.meta);
              return `[${info.level.toLocaleUpperCase()}]: ${[info.timestamp]}: ${info.message}`;
            }
            return `[${info.level.toLocaleUpperCase()}]: ${[info.timestamp]}: ${info.message}${
              info.meta ? `: ${JSON.stringify(info.meta)}` : ''
            }`;
          })
        )
      })
    ]
  });
}
