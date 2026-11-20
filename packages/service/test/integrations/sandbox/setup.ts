import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { createDefaultInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import '@test/mocks/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import {
  configureRedisRuntime,
  closeRedisRuntime,
  getRedisRuntime
} from '@fastgpt/dal/redis/runtime';
import { initGlobalVariables } from '@/service/common/system';
import setupModels from '@test/setupModels';
import { afterAll, beforeAll, inject } from 'vitest';

/** 从独立集成测试环境变量构建运行期 Admin 配置快照，避免依赖已废弃的 ENV 兜底。 */
const buildSandboxIntegrationInstanceConfig = () => {
  if (process.env.SANDBOX_INTEGRATION?.toLowerCase() !== 'true') {
    return createDefaultInstanceConfig();
  }

  return resolveSystemInstanceConfig({
    subservice: {
      agentSandbox: {
        enabled: true,
        proxy: {
          wsUrl: process.env.AGENT_SANDBOX_PROXY_URL || 'ws://localhost:3006',
          previewUrl: process.env.AGENT_SANDBOX_PREVIEW_PROXY_URL || 'http://localhost:3006',
          secret:
            process.env.AGENT_SANDBOX_PROXY_SECRET || 'fastgpt_sandbox_integration_secret_32chars'
        },
        common: {
          ...(process.env.AGENT_SANDBOX_CPU_COUNT
            ? { cpuCount: Number(process.env.AGENT_SANDBOX_CPU_COUNT) }
            : {}),
          ...(process.env.AGENT_SANDBOX_MEMORY_MIB
            ? { memoryMiB: Number(process.env.AGENT_SANDBOX_MEMORY_MIB) }
            : {}),
          ...(process.env.AGENT_SANDBOX_STORAGE_SIZE_GI
            ? { storageSizeGi: Number(process.env.AGENT_SANDBOX_STORAGE_SIZE_GI) }
            : {}),
          ...(process.env.AGENT_SANDBOX_SUSPEND_MINUTES
            ? { suspendMinutes: Number(process.env.AGENT_SANDBOX_SUSPEND_MINUTES) }
            : {}),
          ...(process.env.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS
            ? { archiveInactiveDays: Number(process.env.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS) }
            : {}),
          ...(process.env.AGENT_SANDBOX_MAX_EDIT_DEBUG
            ? { maxEditDebug: Number(process.env.AGENT_SANDBOX_MAX_EDIT_DEBUG) }
            : {}),
          ...(process.env.AGENT_SANDBOX_MAX_PER_TEAM
            ? { maxPerTeam: Number(process.env.AGENT_SANDBOX_MAX_PER_TEAM) }
            : {})
        },
        opensandbox: {
          baseUrl: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL || '',
          apiKey: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY || '',
          runtime:
            process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes'
              ? 'kubernetes'
              : 'docker',
          image: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE || '',
          useServerProxy: process.env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY !== 'false',
          volumeManagerUrl: process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL || '',
          volumeManagerToken: process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN || '',
          volumeNamePrefix:
            process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX || 'fastgpt-sandbox'
        }
      }
    }
  });
};

configureRedisRuntime({
  redisUrl: process.env.REDIS_URL ?? 'redis://default:mypassword@localhost:6379/15'
});

/**
 * Sandbox 专用 integration setup。
 *
 * Mongo 使用随机测试数据库；Redis 则连接 dev 实例的隔离 DB，确保 lifecycle lease 和
 * preview session 都经过真实 Redis 命令，而不是通用单测 setup 的内存实现。
 */
beforeAll(async () => {
  await getRedisRuntime().checkHealth();
  await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  initGlobalVariables();
  global.agentUserTmbIds = new Set();
  global.systemInstanceConfig = buildSandboxIntegrationInstanceConfig();
  await setupModels();
});

afterAll(async () => {
  await connectionMongo.connection.db?.dropDatabase();
  await connectionLogMongo.connection.db?.dropDatabase();
  await connectionMongo.disconnect();
  await connectionLogMongo.disconnect();
  await closeRedisRuntime();
});
