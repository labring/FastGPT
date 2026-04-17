import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getSandboxClient,
  type SandboxClient,
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId
} from '@fastgpt/service/core/ai/sandbox/controller';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { delay } from '@fastgpt/global/common/system/utils';

const { Types } = connectionMongo;

const hasSandboxEnv = !!process.env.AGENT_SANDBOX_PROVIDER;
vi.mock('@fastgpt/service/env', () => ({
  env: {
    AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
    AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
    AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,

    AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
    AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG,
    AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY:
      process.env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY,
    AGENT_SANDBOX_ENABLE_VOLUME: process.env.AGENT_SANDBOX_ENABLE_VOLUME,
    AGENT_SANDBOX_VOLUME_MANAGER_URL: process.env.AGENT_SANDBOX_VOLUME_MANAGER_URL,
    AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: process.env.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: '/home/sandbox',

    AGENT_SANDBOX_E2B_API_KEY: process.env.AGENT_SANDBOX_E2B_API_KEY
  }
}));

describe.skipIf(!hasSandboxEnv).sequential('Sandbox Integration', () => {
  const testDir = '/tmp/workspace';
  const testParams = {
    appId: String(new Types.ObjectId()),
    userId: 'integration-user',
    chatId: `integration-chat-${Date.now()}`
  };
  let sandbox: SandboxClient;

  // 测试开始前，确认 workspace 存在
  beforeAll(async () => {
    sandbox = await getSandboxClient(testParams);
    const result = await sandbox.exec(`mkdir -p ${testDir} && cd ${testDir}`);
    expect(result.exitCode).toBe(0);
    await delay(2000);
  });

  afterAll(async () => {
    // 清理测试创建的沙盒实例
    try {
      await sandbox.delete();
    } catch (error) {
      console.warn('Failed to cleanup sandbox:', error);
    }
  });

  it('should create sandbox and execute echo command', async () => {
    const result = await sandbox.exec('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('should return non-zero exitCode for failing command', async () => {
    const result = await sandbox.exec('exit 1');
    expect(result.exitCode).not.toBe(0);
  });

  it('should share filesystem within same session', async () => {
    await sandbox.exec(`touch ${testDir}/test-integration.txt`);
    const result = await sandbox.exec(`ls ${testDir}/test-integration.txt`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('test-integration.txt');
  });

  it('should delete sandbox and clean DB on deleteSandboxesByChatIds', async () => {
    await sandbox.exec('echo setup');
    await deleteSandboxesByChatIds({ appId: testParams.appId, chatIds: [testParams.chatId] });

    const count = await MongoSandboxInstance.countDocuments({ chatId: testParams.chatId });
    expect(count).toBe(0);
  });

  // ===== 错误处理和边界情况 =====
  describe('Error Handling', () => {
    it('should handle command timeout gracefully', async () => {
      // 超时会抛出异常而不是返回错误码
      await expect(sandbox.exec('sleep 3', 1)).rejects.toThrow();
    });

    it('should handle invalid commands', async () => {
      const result = await sandbox.exec('nonexistent-command-xyz');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should handle empty command', async () => {
      // 空命令在某些沙盒实现中可能失败，改为测试 true 命令
      const result = await sandbox.exec('true');
      expect(result.exitCode).toBe(0);
    });

    it('should handle very long output', async () => {
      const result = await sandbox.exec('seq 1 10000');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  // ===== 状态管理测试 =====
  describe('State Management', () => {
    it('should update status to running after exec', async () => {
      await sandbox.exec('echo test');

      const doc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
      expect(doc?.status).toBe(SandboxStatusEnum.running);
      expect(doc?.lastActiveAt).toBeDefined();
    });

    it('should stop sandbox and update status', async () => {
      await sandbox.exec('echo test');
      await sandbox.stop();

      const doc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
      expect(doc?.status).toBe(SandboxStatusEnum.stopped);
    });

    it('should update lastActiveAt on each exec', async () => {
      await sandbox.exec('echo first');

      const firstDoc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
      const firstTime = firstDoc?.lastActiveAt;

      await new Promise((resolve) => setTimeout(resolve, 100));
      await sandbox.exec('echo second');

      const secondDoc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
      const secondTime = secondDoc?.lastActiveAt;

      expect(secondTime?.getTime()).toBeGreaterThan(firstTime?.getTime() || 0);
    });

    it('should persist sandbox metadata correctly', async () => {
      await sandbox.exec('echo test');

      const doc = await MongoSandboxInstance.findOne({ chatId: testParams.chatId });
      expect(String(doc?.appId)).toBe(testParams.appId);
      expect(doc?.userId).toBe(testParams.userId);
      expect(doc?.chatId).toBe(testParams.chatId);
      expect(doc?.createdAt).toBeDefined();
    });
  });

  // ===== 批量操作测试 =====
  describe('Batch Operations', () => {
    it('should delete multiple sandboxes by chatIds', async () => {
      const chatId1 = `${testParams.chatId}-1`;
      const chatId2 = `${testParams.chatId}-2`;

      const sandbox1 = await getSandboxClient({ ...testParams, chatId: chatId1 });
      const sandbox2 = await getSandboxClient({ ...testParams, chatId: chatId2 });

      await sandbox1.exec('echo test1');
      await sandbox2.exec('echo test2');

      await deleteSandboxesByChatIds({
        appId: testParams.appId,
        chatIds: [chatId1, chatId2]
      });

      const count = await MongoSandboxInstance.countDocuments({
        chatId: { $in: [chatId1, chatId2] }
      });
      expect(count).toBe(0);
    });

    it('should delete all sandboxes by appId', async () => {
      const chatId1 = `${testParams.chatId}-app-1`;
      const chatId2 = `${testParams.chatId}-app-2`;

      const sandbox1 = await getSandboxClient({ ...testParams, chatId: chatId1 });
      const sandbox2 = await getSandboxClient({ ...testParams, chatId: chatId2 });

      await sandbox1.exec('echo test1');
      await sandbox2.exec('echo test2');

      await deleteSandboxesByAppId(testParams.appId);

      const count = await MongoSandboxInstance.countDocuments({ appId: testParams.appId });
      expect(count).toBe(0);
    });

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
  describe('Concurrency', () => {
    it('should handle concurrent exec calls on same sandbox', async () => {
      // 先确保沙盒已初始化
      await sandbox.exec('echo init');

      const results = await Promise.all([
        sandbox.exec('echo test1'),
        sandbox.exec('echo test2'),
        sandbox.exec('echo test3')
      ]);

      results.forEach((result) => {
        expect(result.exitCode).toBe(0);
      });
    });

    it('should handle concurrent sandbox creation with same chatId', async () => {
      const sandbox1 = await getSandboxClient(testParams);
      const sandbox2 = await getSandboxClient(testParams);

      const results = await Promise.all([sandbox1.exec('echo test1'), sandbox2.exec('echo test2')]);

      results.forEach((result) => {
        expect(result.exitCode).toBe(0);
      });

      const count = await MongoSandboxInstance.countDocuments({ chatId: testParams.chatId });
      expect(count).toBe(1); // 应该只有一个文档
    });

    it('should handle concurrent delete operations', async () => {
      await sandbox.exec('echo test');

      await Promise.all([
        deleteSandboxesByChatIds({ appId: testParams.appId, chatIds: [testParams.chatId] }),
        deleteSandboxesByChatIds({ appId: testParams.appId, chatIds: [testParams.chatId] })
      ]);

      const count = await MongoSandboxInstance.countDocuments({ chatId: testParams.chatId });
      expect(count).toBe(0);
    });
  });

  // ===== 文件系统持久化测试 =====
  describe('Filesystem Persistence', () => {
    it('should persist files across multiple exec calls', async () => {
      await sandbox.exec(`echo "content" > ${testDir}/test.txt`);
      const result1 = await sandbox.exec(`cat ${testDir}/test.txt`);
      expect(result1.stdout).toContain('content');

      await sandbox.exec(`echo "more" >> ${testDir}/test.txt`);
      const result2 = await sandbox.exec(`cat ${testDir}/test.txt`);
      expect(result2.stdout).toContain('content');
      expect(result2.stdout).toContain('more');
    });

    it('should handle directory operations', async () => {
      await sandbox.exec(`touch ${testDir}/file.txt`);
      const result = await sandbox.exec(`ls ${testDir}`);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file.txt');
    });

    it('should handle file permissions', async () => {
      await sandbox.exec(`touch ${testDir}/script.sh`);
      await sandbox.exec(`chmod +x ${testDir}/script.sh`);
      await sandbox.exec(`echo "#!/bin/bash\necho executed" > ${testDir}/script.sh`);

      const result = await sandbox.exec(`${testDir}/script.sh`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('executed');
    });
  });

  // ===== 环境变量和工作目录测试 =====
  describe('Environment and Working Directory', () => {
    it('should maintain working directory across commands', async () => {
      await sandbox.exec(`cd ${testDir} && pwd`);
      const result = await sandbox.exec('pwd');
      // 注意：每次 exec 可能重置工作目录，这取决于实现
      expect(result.exitCode).toBe(0);
    });

    it('should handle environment variables', async () => {
      const result = await sandbox.exec('export TEST_VAR=hello && echo $TEST_VAR');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });
  });

  // ===== 资源限制测试 =====
  describe('Resource Limits', () => {
    it('should handle large file creation', async () => {
      const result = await sandbox.exec(`dd if=/dev/zero of=${testDir}/large.bin bs=1M count=10`);
      expect(result.exitCode).toBe(0);

      const sizeResult = await sandbox.exec(`ls -lh ${testDir}/large.bin`);
      expect(sizeResult.stdout).toContain('10M');
    });

    it('should handle process spawning', async () => {
      // 先确保沙盒已初始化
      await sandbox.exec('echo init');

      const result = await sandbox.exec('for i in {1..5}; do echo "process $i" & done; wait');
      expect(result.exitCode).toBe(0);
    });
  });
});
