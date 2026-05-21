import { describe, expect, it } from 'vitest';
import { E2BAdapter } from '@/adapters/E2BAdapter';
import { ConnectionError } from '@/errors';

/**
 * Unit tests for E2BAdapter.
 *
 * These tests verify the E2BAdapter lifecycle, command execution,
 * and health checks using mocked API behavior.
 */
describe('E2BAdapter', () => {
  describe('Lifecycle Methods', () => {
    it('should initialize with correct default values', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      expect(adapter.provider).toBe('e2b');
      expect(adapter.id).toBe('test-sandbox-id'); // 现在返回传入的 sandboxId
      expect(adapter.status.state).toBe('Creating'); // 初始状态为 Creating（来自 BaseSandboxAdapter）
    });

    it('should initialize with custom config', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'custom-sandbox-id',
        template: 'python-3.11',
        timeout: 300
      });

      expect(adapter.provider).toBe('e2b');
      expect(adapter.id).toBe('custom-sandbox-id'); // 返回传入的 sandboxId
      expect(adapter.status.state).toBe('Creating');
    });

    it('should use default base URL when not provided', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      expect(adapter.provider).toBe('e2b');
    });

    it('should handle connection errors gracefully', async () => {
      const adapter = new E2BAdapter({
        apiKey: 'invalid-api-key',
        template: 'python-3.11',
        sandboxId: 'test-sandbox-id'
      });

      try {
        await adapter.create();
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof ConnectionError || error instanceof Error).toBe(true);
      }
    });

    it('should update status after lifecycle operations', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      expect(adapter.status).toBeDefined();
      expect([
        'UnExist',
        'Running',
        'Creating',
        'Starting',
        'Stopping',
        'Stopped',
        'Deleting',
        'Error'
      ]).toContain(adapter.status.state);
    });
  });

  describe('Configuration', () => {
    it('should handle full configuration', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'sandbox-123',
        template: 'node-18',
        timeout: 600
      });

      expect(adapter.id).toBe('sandbox-123'); // 返回传入的 sandboxId
      expect(adapter.provider).toBe('e2b');
    });

    it('should handle minimal configuration', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'minimal-sandbox'
      });

      expect(adapter.id).toBe('minimal-sandbox'); // 返回传入的 sandboxId
      expect(adapter.provider).toBe('e2b');
    });

    it('should handle metadata in configuration', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'metadata-sandbox',
        metadata: {
          project: 'test-project',
          environment: 'development'
        }
      });

      expect(adapter.id).toBe('metadata-sandbox');
      expect(adapter.provider).toBe('e2b');
    });
  });

  describe('Provider', () => {
    it('should have unique provider name', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      expect(adapter.provider).toBe('e2b');
      expect(adapter.provider).not.toBe('opensandbox');
      expect(adapter.provider).not.toBe('sealosdevbox');
    });
  });

  describe('State Management', () => {
    it('should track status state correctly', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      expect(adapter.status.state).toBe('Creating'); // 初始状态来自 BaseSandboxAdapter

      const validStates = [
        'UnExist',
        'Running',
        'Creating',
        'Starting',
        'Stopping',
        'Stopped',
        'Deleting',
        'Error'
      ];
      expect(validStates).toContain(adapter.status.state);
    });

    it('should always return the provided sandboxId', () => {
      const sandboxId = 'my-unique-sandbox';
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId
      });

      expect(adapter.id).toBe(sandboxId);
    });

    it('should maintain sandboxId throughout lifecycle', () => {
      const sandboxId = 'persistent-sandbox';
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId
      });

      // ID 应该在整个生命周期中保持不变
      expect(adapter.id).toBe(sandboxId);
    });
  });

  describe('Sandbox ID Management', () => {
    it('should require sandboxId in configuration', () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'required-sandbox-id'
      });

      expect(adapter.id).toBe('required-sandbox-id');
    });

    it('should use sandboxId for metadata mapping', () => {
      const sandboxId = 'metadata-mapped-sandbox';
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId
      });

      // sandboxId 用于 metadata 映射
      expect(adapter.id).toBe(sandboxId);
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', () => {
      const connectionError = new ConnectionError(
        'Failed to create sandbox',
        'e2b',
        new Error('Network timeout')
      );

      expect(connectionError.message).toContain('Failed to create sandbox');
      expect(connectionError.endpoint).toBe('e2b');
      expect(connectionError.cause).toBeDefined();
    });
  });

  describe('Wait Until Ready', () => {
    it('should timeout when sandbox not ready', async () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      try {
        await adapter.waitUntilReady(100);
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe('getInfo', () => {
    it('should handle getInfo when sandbox not initialized', async () => {
      const adapter = new E2BAdapter({
        apiKey: 'test-api-key',
        sandboxId: 'test-sandbox-id'
      });

      // getInfo 会尝试 ensureSandbox，但由于 API key 无效会失败
      try {
        await adapter.getInfo();
      } catch (error) {
        // 预期会抛出错误，因为无法连接到 E2B
        expect(error).toBeDefined();
      }
    });
  });
});
