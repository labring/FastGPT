import { exit } from 'process';
import {
  runBackgroundInitializationStep,
  getInitializationErrorLog,
  runInitializationStep
} from '@fastgpt/service/common/system/initError';

export async function registerNodeInstrumentation() {
  try {
    await runInitializationStep({
      step: 'load-proxy',
      action: async () => import('@fastgpt/service/common/proxy')
    });

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
      { getSystemTools },
      { trackTimerProcess },
      { initBullMQWorkers },
      { initS3Buckets },
      { initGeo },
      { instrumentationCheck },
      { getErrText },
      { configureLogger, getLogger, LogCategories },
      { InitialErrorEnum }
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
      import('@fastgpt/service/core/app/tool/controller'),
      import('@fastgpt/service/common/middle/tracks/processor'),
      import('@/service/common/bullmq'),
      import('@fastgpt/service/common/s3'),
      import('@fastgpt/service/common/geo'),
      import('@/service/common/system/health'),
      import('@fastgpt/global/common/error/utils'),
      import('@fastgpt/service/common/logger'),
      import('@fastgpt/service/common/system/constants')
    ]);

    await runInitializationStep({
      step: 'configure-logger',
      action: () => configureLogger()
    });
    const logger = getLogger(LogCategories.SYSTEM);
    logger.info('Starting system initialization...');

    await runInitializationStep({
      step: 'system-start-callback',
      action: () => systemStartCb(),
      logger
    });
    await runInitializationStep({
      step: 'init-global-variables',
      action: () => initGlobalVariables(),
      logger
    });

    await Promise.all([
      runInitializationStep({
        step: 'init-s3-buckets',
        stage: InitialErrorEnum.S3_ERROR,
        action: () => initS3Buckets(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'connect-main-mongo',
        stage: InitialErrorEnum.MONGO_ERROR,
        action: () =>
          connectMongo({
            db: connectionMongo,
            url: MONGO_URL,
            connectedCb: () => startMongoWatch()
          }),
        logger,
        getErrText,
        meta: {
          mongoUrl: MONGO_URL
        }
      }),
      runInitializationStep({
        step: 'connect-log-mongo',
        stage: InitialErrorEnum.MONGO_ERROR,
        action: () =>
          connectMongo({
            db: connectionLogMongo,
            url: MONGO_LOG_URL
          }),
        logger,
        getErrText,
        meta: {
          mongoLogUrl: MONGO_LOG_URL
        }
      }),
      runInitializationStep({
        step: 'init-bullmq-workers',
        stage: InitialErrorEnum.REDIS_ERROR,
        action: () => initBullMQWorkers(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'init-vector-store',
        stage: InitialErrorEnum.VECTORDB_ERROR,
        action: () => initVectorStore(),
        logger,
        getErrText
      })
    ]);

    await runInitializationStep({
      step: 'get-init-config',
      action: () => getInitConfig(),
      logger,
      getErrText
    });

    await runInitializationStep({
      step: 'instrumentation-check',
      action: () => instrumentationCheck(),
      logger,
      getErrText
    });

    await Promise.all([
      runInitializationStep({
        step: 'init-root-user',
        action: () => initRootUser(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'load-system-models',
        stage: InitialErrorEnum.PLUGIN_ERROR,
        action: () => loadSystemModels(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'load-system-tools',
        stage: InitialErrorEnum.PLUGIN_ERROR,
        action: () => getSystemTools(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'init-system-plugin-tags',
        stage: InitialErrorEnum.PLUGIN_ERROR,
        action: () => initSystemPluginTags(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'init-app-template-types',
        action: () => initAppTemplateTypes(),
        logger,
        getErrText
      }),
      runInitializationStep({
        step: 'preload-worker',
        action: () => preLoadWorker(),
        logger,
        getErrText
      }).catch(() => undefined)
    ]);

    await runInitializationStep({
      step: 'init-geo',
      action: () => initGeo(),
      logger,
      getErrText
    });
    await runInitializationStep({
      step: 'start-cron',
      action: () => startCron(),
      logger,
      getErrText
    });
    await runInitializationStep({
      step: 'start-training-queue',
      action: () => startTrainingQueue(true),
      logger,
      getErrText
    });
    runBackgroundInitializationStep({
      step: 'track-timer-process',
      action: () => trackTimerProcess(),
      logger,
      getErrText
    });

    logger.info('System initialized successfully');
  } catch (error) {
    const logPayload = {
      nextRuntime: process.env.NEXT_RUNTIME,
      nodeEnv: process.env.NODE_ENV,
      ...getInitializationErrorLog(error)
    };

    console.error('System initialization failed', logPayload);

    try {
      const { getLogger, LogCategories } = await import('@fastgpt/service/common/logger');
      getLogger(LogCategories.SYSTEM).error('System initialization failed', logPayload);
    } catch (loggerError) {
      console.error('Failed to record system initialization failure', {
        ...getInitializationErrorLog(loggerError)
      });
    }

    exit(1);
  }
}
