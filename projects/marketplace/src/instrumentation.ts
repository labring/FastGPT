import { exit } from 'process';

export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { configureLogger, getLogger, LogCategories } = await import('@/service/logger');
      await configureLogger();
      const logger = getLogger(LogCategories.SYSTEM);

      await import('@fastgpt/service/common/proxy');

      const [{ getToolList }, { connectMongo, connectionMongo, MONGO_URL }] = await Promise.all([
        import('@/service/tool/data'),
        import('@/service/mongo')
      ]);

      await connectMongo(connectionMongo, MONGO_URL);
      await getToolList();

      logger.info('Init system success');
    }
  } catch (error) {
    const { getLogger, LogCategories } = await import('@/service/logger');
    getLogger(LogCategories.SYSTEM).error('Init system error', { error });
    exit(1);
  }
}
