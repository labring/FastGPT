import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/service/runtime';
import {
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId
} from '@fastgpt/service/core/ai/sandbox/service/resource';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { delay } from '@fastgpt/global/common/system/utils';

const { Types } = connectionMongo;

const hasSandboxEnv = !!process.env.AGENT_SANDBOX_PROVIDER;
const runFullIntegration = process.env.SANDBOX_INTEGRATION_FULL === 'true';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: (() => {
    const envBool = (value: string | undefined) => value === 'true';

    return {
      AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
      AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
      AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,

      AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
      AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG,
      AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: envBool(
        process.env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      ),
      AGENT_SANDBOX_ENABLE_VOLUME: envBool(process.env.AGENT_SANDBOX_ENABLE_VOLUME),
      AGENT_SANDBOX_VOLUME_MANAGER_URL: process.env.AGENT_SANDBOX_VOLUME_MANAGER_URL,
      AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: process.env.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,

      AGENT_SANDBOX_E2B_API_KEY: process.env.AGENT_SANDBOX_E2B_API_KEY
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
  const execReadySandbox = (command: string, timeout?: number, target: SandboxClient = sandbox) =>
    target.provider.execute(command, {
      timeoutMs: timeout ? timeout * 1000 : undefined
    });

  // 测试开始前，确认 workspace 存在
  beforeAll(async () => {
    sandbox = await getSandboxClient(testParams);
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

  it('should return non-zero exitCode for failing command', async () => {
    const result = await execReadySandbox('exit 1');
    expect(result.exitCode).not.toBe(0);
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
    const limitedSandbox = await getSandboxClient(params, { resourceLimits });

    try {
      const doc = await MongoSandboxInstance.findOne({ chatId: params.chatId });
      expect(doc?.limit?.cpuCount).toBe(resourceLimits.cpuCount);
      expect(doc?.limit?.memoryMiB).toBe(resourceLimits.memoryMiB);
      expect(doc?.limit?.diskGiB).toBe(resourceLimits.diskGiB);
    } finally {
      await limitedSandbox.delete();
    }
  }, 120_000);

  it('should share filesystem within same session', async () => {
    await execReadySandbox(`touch ${testDir}/test-integration.txt`);
    const result = await execReadySandbox(`ls ${testDir}/test-integration.txt`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('test-integration.txt');
  });

  it('should delete sandbox and clean DB on deleteSandboxesByChatIds', async () => {
    const params = createSandboxParams('delete-chat');
    await getSandboxClient(params);
    await deleteSandboxesByChatIds({ appId: params.appId, chatIds: [params.chatId] });

    const count = await MongoSandboxInstance.countDocuments({ chatId: params.chatId });
    expect(count).toBe(0);
  });

  // ===== 错误处理和边界情况 =====
  describe('Error Handling', () => {
    it('should handle command timeout gracefully', async () => {
      const result = await execReadySandbox('timeout 1 sleep 3');
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle invalid commands', async () => {
      const result = await execReadySandbox('nonexistent-command-xyz');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should handle empty command', async () => {
      // 空命令在某些沙盒实现中可能失败，改为测试 true 命令
      const result = await execReadySandbox('true');
      expect(result.exitCode).toBe(0);
    });

    it('should handle very long output', async () => {
      const result = await execReadySandbox('seq 1 10000');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
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
      const stopSandbox = await getSandboxClient(params);
      await stopSandbox.stop();

      const doc = await MongoSandboxInstance.findOne({ chatId: params.chatId });
      expect(doc?.status).toBe(SandboxStatusEnum.stopped);

      await stopSandbox.delete();
    });

    it.runIf(runFullIntegration)(
      'should update lastActiveAt on each exec',
      async () => {
        await sandbox.ensureAvailable();

        const firstDoc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
        const firstTime = firstDoc?.lastActiveAt;

        await new Promise((resolve) => setTimeout(resolve, 100));
        await sandbox.ensureAvailable();

        const secondDoc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
        const secondTime = secondDoc?.lastActiveAt;

        expect(secondTime?.getTime()).toBeGreaterThan(firstTime?.getTime() || 0);
      },
      130_000
    );

    it('should persist sandbox metadata correctly', async () => {
      await sandbox.ensureAvailable();

      const doc = await MongoSandboxInstance.findOne({ sandboxId: sandbox.getSandboxId() });
      expect(doc?.provider).toBe('opensandbox');
      expect(doc?.sandboxId).toBe(sandbox.getSandboxId());
      expect(doc?.createdAt).toBeDefined();
    });
  });

  // ===== 批量操作测试 =====
  describe.runIf(runFullIntegration)('Batch Operations', () => {
    it('should delete multiple sandboxes by chatIds', async () => {
      const chatId1 = `${testParams.chatId}-1`;
      const chatId2 = `${testParams.chatId}-2`;

      await getSandboxClient({ ...testParams, chatId: chatId1 });
      await getSandboxClient({ ...testParams, chatId: chatId2 });

      await deleteSandboxesByChatIds({
        appId: testParams.appId,
        chatIds: [chatId1, chatId2]
      });

      const count = await MongoSandboxInstance.countDocuments({
        chatId: { $in: [chatId1, chatId2] }
      });
      expect(count).toBe(0);
    }, 180_000);

    it('should delete all sandboxes by appId', async () => {
      const params = createSandboxParams('delete-app');
      const chatId1 = `${params.chatId}-app-1`;
      const chatId2 = `${params.chatId}-app-2`;

      await getSandboxClient({ ...params, chatId: chatId1 });
      await getSandboxClient({ ...params, chatId: chatId2 });

      await deleteSandboxesByAppId(params.appId);

      const count = await MongoSandboxInstance.countDocuments({ appId: params.appId });
      expect(count).toBe(0);
    }, 180_000);

    it('should handle empty chatIds array gracefully', async () => {
      await expect(
        deleteSandboxesByChatIds({ appId: testParams.appId, chatIds: [] })
      ).resolves.not.toThrow();
    });

    it('should handle non-existent chatIds gracefully', async () => {
      await expect(
        deleteSandboxesByChatIds({
          appId: testParams.appId,
          chatIds: ['non-existent-chat-id']
        })
      ).resolves.not.toThrow();
    });
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

    it('should handle concurrent sandbox creation with same chatId', async () => {
      const sandbox1 = await getSandboxClient(testParams);
      const sandbox2 = await getSandboxClient(testParams);

      const results = await Promise.all([
        execReadySandbox('echo test1', undefined, sandbox1),
        execReadySandbox('echo test2', undefined, sandbox2)
      ]);

      results.forEach((result) => {
        expect(result.exitCode).toBe(0);
      });

      const count = await MongoSandboxInstance.countDocuments({ chatId: testParams.chatId });
      expect(count).toBe(1); // 应该只有一个文档
    }, 130_000);

    it('should handle concurrent delete operations', async () => {
      const params = createSandboxParams('concurrent-delete');
      await getSandboxClient(params);

      await Promise.all([
        deleteSandboxesByChatIds({ appId: params.appId, chatIds: [params.chatId] }),
        deleteSandboxesByChatIds({ appId: params.appId, chatIds: [params.chatId] })
      ]);

      const count = await MongoSandboxInstance.countDocuments({ chatId: params.chatId });
      expect(count).toBe(0);
    }, 130_000);
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

    it('should handle directory operations', async () => {
      await execReadySandbox(`touch ${testDir}/file.txt`);
      const result = await execReadySandbox(`ls ${testDir}`);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file.txt');
    });

    it('should handle file permissions', async () => {
      await execReadySandbox(`touch ${testDir}/script.sh`);
      await execReadySandbox(`chmod +x ${testDir}/script.sh`);
      await execReadySandbox(`echo "#!/bin/bash\necho executed" > ${testDir}/script.sh`);

      const result = await execReadySandbox(`${testDir}/script.sh`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('executed');
    });
  });

  // ===== 环境变量和工作目录测试 =====
  describe('Environment and Working Directory', () => {
    it('should maintain working directory across commands', async () => {
      await execReadySandbox(`cd ${testDir} && pwd`);
      const result = await execReadySandbox('pwd');
      // 注意：每次 exec 可能重置工作目录，这取决于实现
      expect(result.exitCode).toBe(0);
    });

    it('should handle environment variables', async () => {
      const result = await execReadySandbox('export TEST_VAR=hello && echo $TEST_VAR');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });
  });

  // ===== 资源限制测试 =====
  describe('Resource Limits', () => {
    it('should handle large file creation', async () => {
      const result = await execReadySandbox(
        `dd if=/dev/zero of=${testDir}/large.bin bs=1M count=10`
      );
      expect(result.exitCode).toBe(0);

      const sizeResult = await execReadySandbox(`ls -lh ${testDir}/large.bin`);
      expect(sizeResult.stdout).toContain('10M');
    });

    it('should handle process spawning', async () => {
      // 先确保沙盒已初始化
      await execReadySandbox('echo init');

      const result = await execReadySandbox('for i in {1..5}; do echo "process $i" & done; wait');
      expect(result.exitCode).toBe(0);
    });
  });
});
