import { exit } from 'process';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { transactionRunner, userRepository, teamRepository } from '@fastgpt/service/common/dal';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { appEnv } from '@/env';

const logger = getLogger(LogCategories.SYSTEM);

export async function initRootUser(retry = 3): Promise<any> {
  try {
    // 环境变量保存明文，DAL 约定只接收并保存已经哈希的密码。
    const password = hashStr(appEnv.DEFAULT_ROOT_PSW);

    // root 用户与默认团队在同一个 DAL 事务内初始化，避免混用两种事务上下文。
    await transactionRunner.withTransaction(async (context) => {
      const rootUser = await userRepository.findByUsername('root');
      // init root user
      if (rootUser) {
        await userRepository.updateById(rootUser.id, { password }, context);
      } else {
        const created = await userRepository.create(
          {
            username: 'root',
            password
          },
          context
        );
        await teamRepository.createDefaultTeam({ userId: created.id, context });
        return;
      }
      // init root team
      await teamRepository.createDefaultTeam({ userId: rootUser.id, context });
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
