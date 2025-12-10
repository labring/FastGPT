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
        { initGeo }
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
        import('@fastgpt/service/common/geo')
      ]);

      // connect to signoz
      connectSignoz();

      // 执行初始化流程
      systemStartCb();
      initGlobalVariables();

      // init s3 buckets
      initS3Buckets();

      // init geo
      initGeo();

      // Connect to MongoDB
      await Promise.all([
        connectMongo({
          db: connectionMongo,
          url: MONGO_URL,
          connectedCb: () => startMongoWatch()
        }),
        initBullMQWorkers()
      ]);
      connectMongo({
        db: connectionLogMongo,
        url: MONGO_LOG_URL
      });

      //init system config；init vector database；init root user
      await Promise.all([getInitConfig(), initVectorStore(), initRootUser(), loadSystemModels()]);

      await Promise.all([
        preLoadWorker().catch(),
        getSystemTools(),
        initSystemPluginTags(),
        initAppTemplateTypes()
      ]);

      startCron();
      startTrainingQueue(true);
      trackTimerProcess();

      console.log('Init system success');
    }
  } catch (error) {
    console.log('Init system error', error);
    exit(1);
  }
}
