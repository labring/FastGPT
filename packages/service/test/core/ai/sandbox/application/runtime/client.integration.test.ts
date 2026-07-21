import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  agentSandboxProviderList,
  SandboxStatusEnum
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { delay } from '@fastgpt/global/common/system/utils';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';

const { Types } = connectionMongo;

const agentSandboxProviderRequiredEnvKeys = {
  sealosdevbox: [
    'AGENT_SANDBOX_SEALOS_BASEURL',
    'AGENT_SANDBOX_SEALOS_TOKEN',
    'AGENT_SANDBOX_SEALOS_IMAGE'
  ],
  opensandbox: ['AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'AGENT_SANDBOX_OPENSANDBOX_API_KEY']
} satisfies Record<SandboxProviderType, readonly string[]>;

const isAgentSandboxProvider = (provider: string | undefined): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

const hasFullAgentSandboxEnv = (): boolean => {
  const provider = process.env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    return false;
  }

  return agentSandboxProviderRequiredEnvKeys[provider].every((key) => !!process.env[key]);
};

const hasSandboxEnv = process.env.SANDBOX_INTEGRATION === 'true' && hasFullAgentSandboxEnv();
const runFullIntegration = process.env.SANDBOX_INTEGRATION_FULL === 'true';

vi.mock('@fastgpt/service/env', () => ({
  ...(() => {
    const envBool = (value: string | undefined) => value === 'true';
    const getAgentSandboxDiskMB = () => Number(process.env.AGENT_SANDBOX_DISK_MB ?? 1024);
    const agentSandboxDiskMB = getAgentSandboxDiskMB();

    return {
      serviceEnv: {
        AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
        AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
        AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
        AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,

        AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
        AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
        AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG,
        AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: envBool(
          process.env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
        ),
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL:
          process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL,
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN:
          process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN,
        AGENT_SANDBOX_DISK_MB: agentSandboxDiskMB
      }
    };
  })()
}));

describe.skipIf(!hasSandboxEnv).sequential('Sandbox Integration', () => {
  const testDir = '/tmp/workspace';
  const testParams = {
    appId: String(new Types.ObjectId()),
    userId: 'integration-user',
    chatId: `integration-chat-${Date.now()}`
  };
  let sandbox: SandboxClient;

  const createSandboxParams = (suffix: string) => ({
    appId: String(new Types.ObjectId()),
    userId: 'integration-user',
    chatId: `integration-chat-${suffix}-${Date.now()}`
  });
  const toAppSandboxQuery = (params: { appId: string; userId: string; chatId: string }) => ({
    sandboxId: getRunningSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: params.appId,
      userId: params.userId
    }),
    sourceType: ChatSourceTypeEnum.app,
    sourceId: params.appId,
    userId: params.userId,
    chatId: params.chatId
  });
  const execReadySandbox = (command: string, timeout?: number, target: SandboxClient = sandbox) =>
    target.provider.execute(command, {
      timeoutMs: timeout ? timeout * 1000 : undefined
    });

  // 测试开始前，确认 workspace 存在
  beforeAll(async () => {
    sandbox = await getSandboxClient(toAppSandboxQuery(testParams));
    const result = await execReadySandbox(`mkdir -p ${testDir} && cd ${testDir}`);
    expect(result.exitCode).toBe(0);
    await delay(2000);
  }, 120_000);

  afterAll(async () => {
    // 清理测试创建的沙盒实例
    try {
      await sandbox?.delete();
    } catch (error) {
      console.warn('Failed to cleanup sandbox:', error);
    }
  }, 60_000);

  it('should create sandbox and execute echo command', async () => {
    const result = await sandbox.exec('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('should enforce SandboxClient exec timeout through OpenSandbox', async () => {
    const startedAt = Date.now();
    const result = await sandbox.exec('sleep 10', 1);

    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(result.exitCode).not.toBe(0);
  }, 15_000);

  it('should persist requested resource limits on sandbox instance record', async () => {
    const params = createSandboxParams('resource-record');
    const resourceLimits = {
      cpuCount: 1,
      memoryMiB: 256,
      diskGiB: 1
    };
    const limitedSandbox = await getSandboxClient(toAppSandboxQuery(params), { resourceLimits });

    try {
      const doc = await MongoSandboxInstance.findOne({ sandboxId: limitedSandbox.getSandboxId() });
      expect(doc?.limit?.cpuCount).toBe(resourceLimits.cpuCount);
      expect(doc?.limit?.memoryMiB).toBe(resourceLimits.memoryMiB);
      expect(doc?.limit?.diskGiB).toBe(resourceLimits.diskGiB);
    } finally {
      await limitedSandbox.delete();
    }
  }, 120_000);

  // ===== 错误处理和边界情况 =====
  describe('Error Handling', () => {
    it('should handle invalid commands', async () => {
      const result = await execReadySandbox('nonexistent-command-xyz');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });
  });

  // ===== 状态管理测试 =====
  describe('State Management', () => {
    it('should update status to running after exec', async () => {
      await sandbox.ensureAvailable();

      const doc = await MongoSandboxInstance.findOne({ sandboxId: sandbox.getSandboxId() });
      expect(doc?.status).toBe(SandboxStatusEnum.running);
      expect(doc?.lastActiveAt).toBeDefined();
    });

    it('should stop sandbox and update status', async () => {
      const params = createSandboxParams('stop');
      const stopSandbox = await getSandboxClient(toAppSandboxQuery(params));
      await stopSandbox.stop();

      const doc = await MongoSandboxInstance.findOne({ sandboxId: stopSandbox.getSandboxId() });
      expect(doc?.status).toBe(SandboxStatusEnum.stopped);

      await stopSandbox.delete();
    });

    it.runIf(runFullIntegration)(
      'should update lastActiveAt on each exec',
      async () => {
        await sandbox.ensureAvailable();

        const firstDoc = await MongoSandboxInstance.findOne({ sandboxId: sandbox.getSandboxId() });
        const firstTime = firstDoc?.lastActiveAt;

        await new Promise((resolve) => setTimeout(resolve, 100));
        await sandbox.ensureAvailable();

        const secondDoc = await MongoSandboxInstance.findOne({ sandboxId: sandbox.getSandboxId() });
        const secondTime = secondDoc?.lastActiveAt;

        expect(secondTime?.getTime()).toBeGreaterThan(firstTime?.getTime() || 0);
      },
      130_000
    );
  });

  // ===== 批量操作测试 =====
  describe.runIf(runFullIntegration)('Batch Operations', () => {
    it('should keep one record when multiple Chats initialize concurrently', async () => {
      const chatId1 = `${testParams.chatId}-1`;
      const chatId2 = `${testParams.chatId}-2`;

      await Promise.all([
        getSandboxClient(toAppSandboxQuery({ ...testParams, chatId: chatId1 })),
        getSandboxClient(toAppSandboxQuery({ ...testParams, chatId: chatId2 }))
      ]);

      const count = await MongoSandboxInstance.countDocuments({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: testParams.appId,
        userId: testParams.userId
      });
      expect(count).toBe(1);
    }, 180_000);
  });

  // ===== 并发和竞态条件 =====
  describe.runIf(runFullIntegration)('Concurrency', () => {
    it('should handle concurrent exec calls on same sandbox', async () => {
      // 先确保沙盒已初始化
      await execReadySandbox('echo init');

      const results = await Promise.all([
        execReadySandbox('echo test1'),
        execReadySandbox('echo test2'),
        execReadySandbox('echo test3')
      ]);

      results.forEach((result) => {
        expect(result.exitCode).toBe(0);
      });
    });
  });

  // ===== 文件系统持久化测试 =====
  describe('Filesystem Persistence', () => {
    it('should persist files across multiple exec calls', async () => {
      await execReadySandbox(`echo "content" > ${testDir}/test.txt`);
      const result1 = await execReadySandbox(`cat ${testDir}/test.txt`);
      expect(result1.stdout).toContain('content');

      await execReadySandbox(`echo "more" >> ${testDir}/test.txt`);
      const result2 = await execReadySandbox(`cat ${testDir}/test.txt`);
      expect(result2.stdout).toContain('content');
      expect(result2.stdout).toContain('more');
    });
  });
});
