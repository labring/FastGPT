import { startQueue } from './utils/tools';
import { PRICE_SCALE } from '@fastgpt/global/common/bill/constants';
import { initPg } from './pg';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getInitConfig, initGlobal } from '@/pages/api/system/getInitData';

/**
 * connect MongoDB and init data
 */
export async function connectToDatabase(): Promise<void> {
  await connectMongo({
    beforeHook: () => {
      initGlobal();
      getInitConfig();
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
