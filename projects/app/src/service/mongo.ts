import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { exit } from 'process';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { appEnv } from '@/env';
import { serviceEnv } from '@fastgpt/service/env';
import { initializeAgentUserTmbIds } from '@fastgpt/service/support/user/agentUser';

const logger = getLogger(LogCategories.SYSTEM);

export async function initRootUser(retry = 3): Promise<string> {
  try {
    const rootUser = await MongoUser.findOne({
      username: 'root'
    });
    const psw = appEnv.DEFAULT_ROOT_PSW;

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

    const rootTmb = await MongoTeamMember.findOne({ userId: rootId }, 'teamId').lean();
    if (!rootTmb) {
      throw new Error('Root team member not found after initialization');
    }

    logger.info('Root user initialized', {
      username: 'root',
      fromEnvPassword: appEnv.DEFAULT_ROOT_PSW !== '123456'
    });
    return String(rootTmb.teamId);
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

export async function initAgentUsers(rootTeamId: string, retry = 5): Promise<void> {
  try {
    const agentUsernames = (serviceEnv.AGENT_USERS ?? '')
      .split(',')
      .map((username) => username.trim())
      .filter(Boolean);
    if (agentUsernames.length === 0) {
      logger.debug('Agent user initialization skipped because AGENT_USERS is empty');
      await initializeAgentUserTmbIds();
      return;
    }
    const defaultAgentPassword = serviceEnv.DEFAULT_AGENT_PSW;
    if (!defaultAgentPassword) {
      throw new Error('DEFAULT_AGENT_PSW is required when AGENT_USERS is configured');
    }

    for (const username of agentUsernames) {
      try {
        const existingUser = await MongoUser.findOne({ username });
        if (existingUser) {
          logger.debug('Agent user already exists', { username });
          continue;
        }

        await mongoSessionRun(async (session) => {
          const [{ _id }] = await MongoUser.create(
            [{ username, password: hashStr(defaultAgentPassword) }],
            { session, ordered: true }
          );
          await MongoTeamMember.create(
            [
              {
                teamId: rootTeamId,
                userId: _id,
                name: username,
                isSetMemberName: true,
                status: TeamMemberStatusEnum.active,
                createTime: new Date()
              }
            ],
            { session }
          );
        });
        logger.info('Agent user created', { username });
      } catch (error) {
        logger.error('Agent user initialization failed', { username, error });
      }
    }
    await initializeAgentUserTmbIds();
  } catch (error) {
    if (retry > 0) {
      logger.warn('Retrying agent user initialization', { retryLeft: retry - 1 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return initAgentUsers(rootTeamId, retry - 1);
    }
    logger.error('Agent users initialization failed after retries', { error });
  }
}
