import mongoose from 'mongoose';
import { startQueue } from './utils/tools';
import { getInitConfig } from '@/pages/api/system/getInitData';
import { User } from './models/user';
import { PRICE_SCALE } from '@fastgpt/common/bill/constants';
import { initPg } from './pg';
import { createHashPassword } from '@/utils/tools';
import { createLogger, format, transports } from 'winston';
import 'winston-mongodb';
import { getTikTokenEnc } from '@/utils/common/tiktoken';
import { initHttpAgent } from '@fastgpt/core/init';

/**
 * connect MongoDB and init data
 */
export async function connectToDatabase(): Promise<void> {
  if (global.mongodb) {
    return;
  }
  global.mongodb = 'connecting';

  // init global data
  global.qaQueueLen = 0;
  global.vectorQueueLen = 0;
  global.sendInformQueue = [];
  global.sendInformQueueLen = 0;

  // logger
  initLogger();

  // init function
  getInitConfig();
  // init tikToken
  getTikTokenEnc();
  initHttpAgent();

  try {
    mongoose.set('strictQuery', true);
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      maxConnecting: Number(process.env.DB_MAX_LINK || 5),
      maxPoolSize: Number(process.env.DB_MAX_LINK || 5),
      minPoolSize: 2
    });

    await initRootUser();
    initPg();
    console.log('mongo connected');
  } catch (error) {
    console.log('error->', 'mongo connect error');
    global.mongodb = null;
  }

  // init function
  startQueue();
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
async function initRootUser() {
  try {
    const rootUser = await User.findOne({
      username: 'root'
    });
    const psw = process.env.DEFAULT_ROOT_PSW || '123456';

    if (rootUser) {
      await User.findOneAndUpdate(
        { username: 'root' },
        {
          password: createHashPassword(psw),
          balance: 999999 * PRICE_SCALE
        }
      );
    } else {
      await User.create({
        username: 'root',
        password: createHashPassword(psw),
        balance: 999999 * PRICE_SCALE
      });
    }

    console.log(`root user init:`, {
      username: 'root',
      password: psw
    });
  } catch (error) {
    console.log('init root user error', error);
  }
}

export * from './models/chat';
export * from './models/chatItem';
export * from './models/app';
export * from './models/user';
export * from './common/bill/schema';
export * from './models/pay';
export * from './models/trainingData';
export * from './models/promotionRecord';
export * from './models/collection';
export * from './models/kb';
export * from './models/inform';
export * from './models/image';

export * from './support/outLink/schema';
export * from './support/openapi/schema';
