import { startQueue } from './utils/tools';
import { PRICE_SCALE } from '@fastgpt/common/bill/constants';
import { initPg } from './pg';
import { getTikTokenEnc } from '@/utils/common/tiktoken';
import { initHttpAgent } from '@fastgpt/core/init';
import { MongoUser } from '@fastgpt/support/user/schema';
import { connectMongo } from '@fastgpt/common/mongo/init';
import { hashStr } from '@fastgpt/common/tools/str';

/**
 * connect MongoDB and init data
 */
export async function connectToDatabase(): Promise<void> {
  await connectMongo({
    beforeHook: () => {
      // init global data
      global.qaQueueLen = 0;
      global.vectorQueueLen = 0;
      global.sendInformQueue = [];
      global.sendInformQueueLen = 0;
      // init tikToken
      getTikTokenEnc();
      initHttpAgent();
    },
    afterHook: async () => {
      await initRootUser();
      initPg();
      // start queue
      startQueue();
    }
  });
}

async function initRootUser() {
  try {
    const rootUser = await MongoUser.findOne({
      username: 'root'
    });
    const psw = process.env.DEFAULT_ROOT_PSW || '123456';

    if (rootUser) {
      await MongoUser.findOneAndUpdate(
        { username: 'root' },
        {
          password: hashStr(psw),
          balance: 999999 * PRICE_SCALE
        }
      );
    } else {
      await MongoUser.create({
        username: 'root',
        password: hashStr(psw),
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
export * from './common/bill/schema';
export * from './models/pay';
export * from './models/trainingData';
export * from './models/promotionRecord';
export * from './models/collection';
export * from './models/inform';
export * from './models/image';
