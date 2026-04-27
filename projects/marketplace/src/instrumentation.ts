import { exit } from 'process';
import {
  getInitializationErrorLog,
  runInitializationStep
} from '@fastgpt/service/common/system/initError';

export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { configureLogger, getLogger, LogCategories } = await import('@/service/logger');
      await runInitializationStep({
        step: 'configure-logger',
        action: () => configureLogger()
      });
      const logger = getLogger(LogCategories.SYSTEM);

      await runInitializationStep({
        step: 'load-proxy',
        action: async () => import('@fastgpt/service/common/proxy'),
        logger
      });

      const [{ getToolList }, { connectMongo, connectionMongo, MONGO_URL }] = await Promise.all([
        import('@/service/tool/data'),
        import('@/service/mongo')
      ]);

      await runInitializationStep({
        step: 'connect-main-mongo',
        action: () => connectMongo(connectionMongo, MONGO_URL),
        logger,
        meta: {
          mongoUrl: MONGO_URL
        }
      });
      await runInitializationStep({
        step: 'load-tool-list',
        action: () => getToolList(),
        logger
      });

      logger.info('Init system success');
    }
  } catch (error) {
    const logPayload = {
      nextRuntime: process.env.NEXT_RUNTIME,
      nodeEnv: process.env.NODE_ENV,
      ...getInitializationErrorLog(error)
    };

    console.error('Init system error', logPayload);

    try {
      const { getLogger, LogCategories } = await import('@/service/logger');
      getLogger(LogCategories.SYSTEM).error('Init system error', logPayload);
    } catch (loggerError) {
      console.error('Failed to record init system error', {
        ...getInitializationErrorLog(loggerError)
      });
    }

    exit(1);
  }
}
