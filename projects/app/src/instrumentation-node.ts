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
      { loadInstalledModels, loadSystemModels },
      { trackTimerProcess },
      { initBullMQWorkers },
      { initS3Buckets },
      { initGeo },
      { instrumentationCheck },
      { getErrText },
      { configureLogger, getLogger, LogCategories },
      { configureMetrics, createRedisRuntimeMetrics },
      { configureTracing },
      { configureRedisRuntime, registerRedisRuntimeShutdown },
      { serviceEnv },
      { InitialErrorEnum },
      { validateAgentSandboxProxyEnv },
      { getReadableSystemResourceInfo },
      { startSystemMigrationRunner }
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
      import('@fastgpt/service/common/middle/tracks/processor'),
      import('@/service/common/bullmq'),
      import('@fastgpt/service/common/s3'),
      import('@fastgpt/service/common/geo'),
      import('@/service/common/system/health'),
      import('@fastgpt/global/common/error/utils'),
      import('@fastgpt/service/common/logger'),
      import('@fastgpt/service/common/metrics'),
      import('@fastgpt/service/common/tracing'),
      import('@fastgpt/dal/redis/runtime'),
      import('@fastgpt/service/env'),
      import('@fastgpt/service/common/system/constants'),
      import('@fastgpt/service/env.util'),
      import('@fastgpt/service/common/system/resource'),
      import('@/migration/runner')
    ]);

    console.log('System resources detected', getReadableSystemResourceInfo());

    await Promise.all([
      runInitializationStep({ step: 'configure-tracing', action: () => configureTracing() }),
      runInitializationStep({ step: 'configure-metrics', action: () => configureMetrics() }),
      runInitializationStep({ step: 'configure-logger', action: () => configureLogger() })
    ]);
    const logger = getLogger(LogCategories.SYSTEM);
    logger.info('Starting system initialization...');

    await runInitializationStep({
      step: 'configure-redis-runtime',
      action: () =>
        configureRedisRuntime({
          redisUrl: serviceEnv.REDIS_URL,
          logger,
          metrics: createRedisRuntimeMetrics()
        }),
      logger,
      getErrText
    });

    await runInitializationStep({
      step: 'register-redis-shutdown',
      action: () => registerRedisRuntimeShutdown({ logger }),
      logger,
      getErrText
    });

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
    await runInitializationStep({
      step: 'validate-agent-sandbox-proxy-env',
      action: () => validateAgentSandboxProxyEnv(),
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
            url: MONGO_URL
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
      // runInitializationStep({
      //   step: 'load-system-tools',
      //   stage: InitialErrorEnum.PLUGIN_ERROR,
      //   action: () => getSystemTools(),
      //   logger,
      //   getErrText
      // }),
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

    // 升级脚本可以依赖完整的模型 Provider、模板和运行时缓存。
    await runInitializationStep({
      step: 'load-system-models',
      stage: InitialErrorEnum.PLUGIN_ERROR,
      action: () => loadSystemModels(),
      logger,
      getErrText
    });

    const migrationRunner = await runInitializationStep({
      step: 'start-system-migration-runner',
      action: () => startSystemMigrationRunner(),
      logger,
      getErrText
    });

    /**
     * 阻塞迁移完成后才启动业务消费者并结束 instrumentation 注册。
     * 这样不仅 HTTP readiness 被阻塞，队列、cron、watch 也不会在旧数据结构上提前消费。
     */
    const startBusinessServices = async () => {
      await Promise.all([
        runInitializationStep({
          step: 'start-mongo-watch',
          action: () => startMongoWatch(),
          logger,
          getErrText
        }),
        runInitializationStep({
          step: 'init-bullmq-workers',
          stage: InitialErrorEnum.REDIS_ERROR,
          action: () => initBullMQWorkers(),
          logger,
          getErrText
        })
      ]);
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
      logger.info('System business services are ready');
    };

    if (migrationRunner.hasBlockingMigrations) {
      // 所有节点都会等待并查询状态，只有 lease owner 执行；失败时此 await 按设计不返回。
      logger.info('App node will remain not ready until all blocking migrations succeed');
      await migrationRunner.waitForBlockingMigrations();

      // 每个节点只需重新读取迁移后的数据库模型；插件模板和自动预装已在初始加载阶段完成。
      await runInitializationStep({
        step: 'reload-system-models-after-blocking-migrations',
        stage: InitialErrorEnum.PLUGIN_ERROR,
        action: () => loadInstalledModels(),
        logger,
        getErrText
      });
    }
    await startBusinessServices();

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
