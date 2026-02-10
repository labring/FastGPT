import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { exit } from 'process';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.SYSTEM);

export async function initRootUser(retry = 3): Promise<any> {
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
          { session, ordered: true }
        );
        rootId = _id;
      }
      // init root team
      await createDefaultTeam({ userId: rootId, session });
    });

    logger.info('Root user initialized', {
      username: 'root',
      fromEnvPassword: !!process.env.DEFAULT_ROOT_PSW
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
