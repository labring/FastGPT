import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeSandboxContract } from './suites';
import { E2BAdapter, type E2BConfig } from '@/adapters';

/**
 * Integration tests for E2BAdapter.
 *
 * These tests require a valid E2B API key.
 * Set the following environment variables to run:
 *   - E2B_API_KEY
 *   - E2B_TEMPLATE (optional, defaults to 'base')
 */

const shouldRun = Boolean(process.env.E2B_API_KEY);

describe.skipIf(!shouldRun).sequential('E2BAdapter Integration Tests', () => {
  if (!shouldRun) {
    return;
  }

  const sandboxId = `test-sandbox-${Date.now()}`;
  const config: E2BConfig = {
    apiKey: process.env.E2B_API_KEY!,
    sandboxId,
    template: process.env.E2B_TEMPLATE || 'base',
    timeout: 300
  };

  const adapter = new E2BAdapter(config);

  beforeAll(async () => {
    await adapter.create();
    expect(adapter.status.state).toBe('Running');
    expect(adapter.id).toBe(sandboxId);
  }, 90_000);

  afterAll(async () => {
    try {
      await adapter.delete();
    } catch (error) {
      console.error('Error during cleanup', error);
    }
  }, 30_000);

  describe('Basic Tests', () => {
    it('should initialize with correct values', () => {
      expect(adapter.provider).toBe('e2b');
      expect(adapter.id).toBeTruthy();
    });

    it('should report running status', async () => {
      const isRunning = await adapter.ping();
      expect(isRunning).toBe(true);
    });

    it('should return sandbox info', async () => {
      const info = await adapter.getInfo();
      expect(info).not.toBeNull();
      expect(info?.id).toBe(adapter.id);
      expect(info?.status.state).toBe('Running');
    });

    it('should reconnect to existing sandbox by metadata', async () => {
      // 创建新的 adapter 实例，使用相同的 sandboxId
      const newAdapter = new E2BAdapter(config);

      // 调用 ensureRunning 应该找到已存在的沙盒
      await newAdapter.ensureRunning();

      expect(newAdapter.id).toBe(sandboxId);
      expect(newAdapter.status.state).toBe('Running');

      // 验证可以执行命令
      const result = await newAdapter.execute('echo "test"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test');
    }, 30_000);
  });

  describeSandboxContract({
    getAdapter: () => adapter
  });
});
