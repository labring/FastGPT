import { exit } from 'process';

/*
  Init system
*/
export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('@fastgpt/service/common/proxy');

      // 基础系统初始化
      const [
        { connectMongo },
        { connectionMongo, connectionLogMongo, MONGO_URL, MONGO_LOG_URL },
        { systemStartCb },
        { initGlobalVariables, getInitConfig, initSystemPluginTags, initAppTemplateTypes },
        { initVectorStore },
        { initRootUser },
        { startMongoWatch },
        { startCron },
        { startTrainingQueue },
        { preLoadWorker },
        { loadSystemModels },
        { connectSignoz },
        { getSystemTools },
        { trackTimerProcess },
        { initBullMQWorkers },
        { initS3Buckets },
        { initGeo },
        { instrumentationCheck, ErrorEnum },
        { getErrText },
        { configureLogger, getLogger, LogCategories }
      ] = await Promise.all([
        import('@fastgpt/service/common/mongo/init'),
        import('@fastgpt/service/common/mongo/index'),
        import('@fastgpt/service/common/system/tools'),
        import('@/service/common/system'),
        import('@fastgpt/service/common/vectorDB/controller'),
        import('@/service/mongo'),
        import('@/service/common/system/volumnMongoWatch'),
        import('@/service/common/system/cron'),
        import('@/service/core/dataset/training/utils'),
        import('@fastgpt/service/worker/preload'),
        import('@fastgpt/service/core/ai/config/utils'),
        import('@fastgpt/service/common/otel/trace/register'),
        import('@fastgpt/service/core/app/tool/controller'),
        import('@fastgpt/service/common/middle/tracks/processor'),
        import('@/service/common/bullmq'),
        import('@fastgpt/service/common/s3'),
        import('@fastgpt/service/common/geo'),
        import('@/service/common/system/health'),
        import('@fastgpt/global/common/error/utils'),
        import('@fastgpt/service/common/logger')
      ]);

      await configureLogger();
      const logger = getLogger(LogCategories.SYSTEM);
      logger.info('Starting system initialization...');

      // 执行初始化流程
      systemStartCb();
      initGlobalVariables();

      // Init infra
      await Promise.all([
        initS3Buckets(),
        connectMongo({
          db: connectionMongo,
          url: MONGO_URL,
          connectedCb: () => startMongoWatch()
        }).catch((err) => {
          return Promise.reject(`[${ErrorEnum.MONGO_ERROR}]: ${getErrText(err)}`);
        }),
        connectMongo({
          db: connectionLogMongo,
          url: MONGO_LOG_URL
        }).catch((err) => {
          return Promise.reject(`[${ErrorEnum.MONGO_ERROR}]: ${getErrText(err)}`);
        }),
        initBullMQWorkers().catch((err) => {
          return Promise.reject(`[${ErrorEnum.REDIS_ERROR}]: ${getErrText(err)}`);
        }),
        initVectorStore().catch((err) => {
          return Promise.reject(`[${ErrorEnum.VECTORDB_ERROR}]: ${getErrText(err)}`);
        }),
        connectSignoz()
      ]);

      // Init system config
      await getInitConfig();

      // Check infrastructure
      await instrumentationCheck();

      // Load init data
      await Promise.all([
        initRootUser(),
        loadSystemModels(),
        getSystemTools(),
        initSystemPluginTags(),
        initAppTemplateTypes(),
        preLoadWorker().catch()
      ]);

      initGeo(); // init geo
      startCron();
      startTrainingQueue(true);
      trackTimerProcess();

      logger.info('System initialized successfully');
    }
  } catch (error) {
    console.error('System initialization failed', error);
    exit(1);
  }
}
