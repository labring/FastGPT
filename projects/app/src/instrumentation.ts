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
        { systemStartCb },
        { initGlobalVariables, getInitConfig, initSystemPlugins },
        { initVectorStore },
        { initRootUser },
        { getSystemPluginCb },
        { startMongoWatch },
        { startCron },
        { startTrainingQueue }
      ] = await Promise.all([
        import('@fastgpt/service/common/mongo/init'),
        import('@fastgpt/service/common/system/tools'),
        import('@/service/common/system'),
        import('@fastgpt/service/common/vectorStore/controller'),
        import('@/service/mongo'),
        import('@/service/core/app/plugin'),
        import('@/service/common/system/volumnMongoWatch'),
        import('@/service/common/system/cron'),
        import('@/service/core/dataset/training/utils')
      ]);

      // 执行初始化流程
      systemStartCb();
      initGlobalVariables();

      // Connect to MongoDB
      await connectMongo();

      //init system config；init vector database；init root user
      await Promise.all([getInitConfig(), initVectorStore(), initRootUser(), initSystemPlugins()]);

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
