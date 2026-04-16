import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { exit } from 'process';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';

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
        // await rootUser.updateOne({
        //   password: hashStr(psw)
        // });
        addLog.debug('root user already exists in database, using existing password');
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
        addLog.debug('root user created', { username: 'root' });
      }
      // init root team
      await createDefaultTeam({ userId: rootId, session });
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

export async function initAgentUsers(): Promise<void> {
  const agentUsernames = process.env.AGENT_USERS
    ? process.env.AGENT_USERS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['agent_user_1', 'agent_user_2', 'agent_user_3'];
  const psw = '123456789';

  for (const username of agentUsernames) {
    try {
      const existingUser = await MongoUser.findOne({ username });
      if (existingUser) {
        addLog.debug(`agent user already exists: ${username}`);
        continue;
      }
      await mongoSessionRun(async (session) => {
        const [{ _id }] = await MongoUser.create([{ username, password: hashStr(psw) }], {
          session,
          ordered: true
        });
        await createDefaultTeam({ userId: _id, session });
      });
      console.log(`agent user created: ${username}`);
    } catch (error) {
      addLog.error(`init agent user error: ${username}`, { error });
    }
  }
}
