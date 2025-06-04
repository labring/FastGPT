import { exit } from 'process';

/*
  Init system
*/
export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // 基础系统初始化
      const [
        { connectMongo },
        { connectionMongo, connectionLogMongo, MONGO_URL, MONGO_LOG_URL },
        { systemStartCb },
        { initGlobalVariables, getInitConfig, initSystemPluginGroups, initAppTemplateTypes },
        { initVectorStore },
        { initRootUser },
        { getSystemPluginCb },
        { startMongoWatch },
        { startCron },
        { startTrainingQueue },
        { preLoadWorker },
        { loadSystemModels }
      ] = await Promise.all([
        import('@fastgpt/service/common/mongo/init'),
        import('@fastgpt/service/common/mongo/index'),
        import('@fastgpt/service/common/system/tools'),
        import('@/service/common/system'),
        import('@fastgpt/service/common/vectorDB/controller'),
        import('@/service/mongo'),
        import('@/service/core/app/plugin'),
        import('@/service/common/system/volumnMongoWatch'),
        import('@/service/common/system/cron'),
        import('@/service/core/dataset/training/utils'),
        import('@fastgpt/service/worker/preload'),
        import('@fastgpt/service/core/ai/config/utils')
      ]);

      // 执行初始化流程
      systemStartCb();
      initGlobalVariables();

      // Connect to MongoDB
      await connectMongo(connectionMongo, MONGO_URL);
      connectMongo(connectionLogMongo, MONGO_LOG_URL);

      //init system config；init vector database；init root user
      await Promise.all([getInitConfig(), initVectorStore(), initRootUser(), loadSystemModels()]);

      try {
        await preLoadWorker();
      } catch (error) {
        console.error('Preload worker error', error);
      }

      // 异步加载
      initSystemPluginGroups();
      initAppTemplateTypes();
      getSystemPluginCb();
      startMongoWatch();
      startCron();
      startTrainingQueue(true);

      console.log('Init system success');
    }
  } catch (error) {
    console.log('Init system error', error);
    exit(1);
  }
}
