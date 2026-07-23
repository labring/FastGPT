import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { exit } from 'process';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { appEnv } from '@/env';

const logger = getLogger(LogCategories.SYSTEM);

/** 初始化 root 用户，并仅在运维配置密码真实变化时刷新密码更新时间。 */
export async function initRootUser(retry = 3): Promise<any> {
  try {
    const rootUser = await MongoUser.findOne({ username: 'root' }).select('+password');
    const psw = appEnv.DEFAULT_ROOT_PSW;
    const password = hashStr(psw);
    const storedPassword = rootUser?.toObject({ getters: false }).password;
    const passwordChanged = storedPassword !== hashStr(password);

    let rootId = rootUser?._id || '';

    await mongoSessionRun(async (session) => {
      // init root user
      if (rootUser) {
        if (passwordChanged) {
          await rootUser.updateOne(
            {
              password,
              passwordUpdateTime: new Date()
            },
            { session }
          );
        }
      } else {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: 'root',
              password,
              passwordUpdateTime: new Date()
            }
          ],
          { session, ordered: true }
        );
        rootId = _id;
      }
      // init root team
      await createDefaultTeam({ userId: rootId, session });
    });

    logger.info('Root user initialized', {
      username: 'root',
      fromEnvPassword: appEnv.DEFAULT_ROOT_PSW !== '123456'
    });
  } catch (error) {
    if (retry > 0) {
      logger.warn('Retrying root user initialization', { retryLeft: retry - 1 });
      return initRootUser(retry - 1);
    } else {
      logger.error('Root user initialization failed', { error });
      exit(1);
    }
  }
}
