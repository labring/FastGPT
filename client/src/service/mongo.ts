import mongoose from 'mongoose';
import tunnel from 'tunnel';
import { startQueue } from './utils/tools';
import { getInitConfig } from '@/pages/api/system/getInitData';
import { User } from './models/user';
import { PRICE_SCALE } from '@/constants/common';
import { connectPg, PgClient } from './pg';
import { createHashPassword } from '@/utils/tools';

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
  global.systemEnv = {
    vectorMaxProcess: 10,
    qaMaxProcess: 10,
    pgIvfflatProbe: 10,
    sensitiveCheck: false
  };
  global.sendInformQueue = [];
  global.sendInformQueueLen = 0;
  // proxy obj
  if (process.env.AXIOS_PROXY_HOST && process.env.AXIOS_PROXY_PORT) {
    global.httpsAgent = tunnel.httpsOverHttp({
      proxy: {
        host: process.env.AXIOS_PROXY_HOST,
        port: +process.env.AXIOS_PROXY_PORT
      }
    });
  }

  // init function
  getInitConfig();

  try {
    mongoose.set('strictQuery', true);
    global.mongodb = await mongoose.connect(process.env.MONGODB_URI as string, {
      bufferCommands: true,
      dbName: process.env.MONGODB_NAME,
      maxConnecting: Number(process.env.DB_MAX_LINK || 5),
      maxPoolSize: Number(process.env.DB_MAX_LINK || 5),
      minPoolSize: 2
    });

    initRootUser();
    initPg();
    console.log('mongo connected');
  } catch (error) {
    console.log('error->', 'mongo connect error');
    global.mongodb = null;
  }

  // init function
  startQueue();
}

async function initRootUser() {
  try {
    const rootUser = await User.findOne({
      username: 'root'
    });
    if (rootUser) {
      console.log('root user already exists');
      return;
    }
    const psw = process.env.DEFAULT_ROOT_PSW || '123456';
    await User.create({
      username: 'root',
      password: createHashPassword(psw),
      balance: 100 * PRICE_SCALE
    });

    console.log(`create root user success`, {
      username: 'root',
      password: psw
    });
  } catch (error) {
    console.log('init root user error', error);
    initRootUser();
  }
}
async function initPg() {
  try {
    await connectPg();
    await PgClient.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS modelData (
          id BIGSERIAL PRIMARY KEY,
          vector VECTOR(1536) NOT NULL,
          user_id VARCHAR(50) NOT NULL,
          kb_id VARCHAR(50) NOT NULL,
          source VARCHAR(100),
          q TEXT NOT NULL,
          a TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS modelData_userId_index ON modelData USING HASH (user_id);
      CREATE INDEX IF NOT EXISTS modelData_kbId_index ON modelData USING HASH (kb_id);
      CREATE INDEX IF NOT EXISTS idx_model_data_md5_q_a_user_id_kb_id ON modelData (md5(q), md5(a), user_id, kb_id);
    `);
    console.log('init pg successful');
  } catch (error) {
    console.log('init pg error', error);
    initPg();
  }
}

export * from './models/authCode';
export * from './models/chat';
export * from './models/app';
export * from './models/user';
export * from './models/bill';
export * from './models/pay';
export * from './models/trainingData';
export * from './models/openapi';
export * from './models/promotionRecord';
export * from './models/collection';
export * from './models/shareChat';
export * from './models/kb';
export * from './models/inform';
export * from './models/image';
