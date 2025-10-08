import { exit } from 'process';

/*
  Init system
*/
// 全局变量保存清理函数
let mongoWatchCleanup: (() => void) | null = null;

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
        { startMongoWatch },
        { startCron },
        { startTrainingQueue },
        { preLoadWorker },
        { loadSystemModels },
        { connectSignoz },
        { getSystemTools },
        { trackTimerProcess }
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
        import('@fastgpt/service/core/app/plugin/controller'),
        import('@fastgpt/service/common/middle/tracks/processor')
      ]);

      // connect to signoz
      connectSignoz();

      // 执行初始化流程
      systemStartCb();
      initGlobalVariables();

      // Connect to MongoDB
      await connectMongo(connectionMongo, MONGO_URL);
      connectMongo(connectionLogMongo, MONGO_LOG_URL);

      //init system config；init vector database；init root user
      await Promise.all([getInitConfig(), initVectorStore(), initRootUser(), loadSystemModels()]);

      await Promise.all([
        preLoadWorker().catch(),
        getSystemTools(),
        initSystemPluginGroups(),
        initAppTemplateTypes()
      ]);

      // 启动 MongoDB Change Streams 并保存清理函数
      mongoWatchCleanup = await startMongoWatch();
      startCron();
      startTrainingQueue(true);
      trackTimerProcess();

      // 注册优雅关闭处理
      setupGracefulShutdown();

      console.log('Init system success');
    }
  } catch (error) {
    console.log('Init system error', error);
    exit(1);
  }
}

// 优雅关闭处理
function setupGracefulShutdown() {
  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    if (mongoWatchCleanup) {
      try {
        mongoWatchCleanup();
        console.log('MongoDB Change Streams closed successfully');
      } catch (error) {
        console.error('Error closing MongoDB Change Streams:', error);
      }
    }
    
    process.exit(0);
  };

  // 监听各种关闭信号
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart
}
