import { PRICE_SCALE } from '@fastgpt/global/support/wallet/constants';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { exit } from 'process';
import { initVectorStore } from '@fastgpt/service/common/vectorStore/controller';
import { startCron } from './common/system/cron';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { initGlobal, getInitConfig } from './common/system';
import { startMongoWatch } from './common/system/volumnMongoWatch';
import { startTrainingQueue } from './core/dataset/training/utils';
import { systemStartCb } from '@fastgpt/service/common/system/tools';
import { addLog } from '@fastgpt/service/common/system/log';
import { getSystemPluginCb } from './core/app/plugin';

/**
 * This function is equivalent to the entry to the service
 * connect MongoDB and init data
 */
export function connectToDatabase() {
  if (!global.systemLoadedGlobalVariables) {
    global.systemLoadedGlobalVariables = true;
    initGlobal();
  }

  return connectMongo().then(async () => {
    if (global.systemLoadedGlobalConfig) return;
    global.systemLoadedGlobalConfig = true;

    try {
      systemStartCb();

      //init system config；init vector database；init root user
      await Promise.all([getInitConfig(), getSystemPluginCb(), initVectorStore(), initRootUser()]);

      startMongoWatch();
      // cron
      startCron();

      // start queue
      startTrainingQueue(true);
    } catch (error) {
      addLog.error('init error', error);
      exit(1);
    }
  });
}

async function initRootUser(retry = 3): Promise<any> {
  try {
    const rootUser = await MongoUser.findOne({
      username: 'root'
    });
    const psw = process.env.DEFAULT_ROOT_PSW || '123456';

    let rootId = rootUser?._id || '';

    await mongoSessionRun(async (session) => {
      // init root user
      if (rootUser) {
        await rootUser.updateOne({
          password: hashStr(psw)
        });
      } else {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: 'root',
              password: hashStr(psw)
            }
          ],
          { session }
        );
        rootId = _id;
      }
      // init root team
      await createDefaultTeam({ userId: rootId, balance: 9999 * PRICE_SCALE, session });
    });

    console.log(`root user init:`, {
      username: 'root',
      password: psw
    });
  } catch (error) {
    if (retry > 0) {
      console.log('retry init root user');
      return initRootUser(retry - 1);
    } else {
      console.error('init root user error', error);
      exit(1);
    }
  }
}
