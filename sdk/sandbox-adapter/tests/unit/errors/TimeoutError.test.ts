import { describe, expect, it } from 'vitest';
import { SandboxReadyTimeoutError, TimeoutError } from '@/errors/TimeoutError';

describe('TimeoutError', () => {
  describe('constructor', () => {
    it('should create timeout error with all properties', () => {
      const error = new TimeoutError('Operation timed out', 5000, 'execute');

      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Operation timed out');
      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('execute');
      expect(error.code).toBe('TIMEOUT');
    });

    it('should set correct timeout value', () => {
      const error = new TimeoutError('Too slow', 30000, 'create');
      expect(error.timeoutMs).toBe(30000);
    });

    it('should set correct operation name', () => {
      const error = new TimeoutError('Failed', 1000, 'ping');
      expect(error.operation).toBe('ping');
    });
  });

  describe('prototype chain', () => {
    it('should be instance of TimeoutError', () => {
      const error = new TimeoutError('Timeout', 1000, 'test');
      expect(error).toBeInstanceOf(TimeoutError);
    });

    it('should be instance of Error', () => {
      const error = new TimeoutError('Timeout', 1000, 'test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe('SandboxReadyTimeoutError', () => {
  describe('constructor', () => {
    it('should create ready timeout error with formatted message', () => {
      const error = new SandboxReadyTimeoutError('sandbox-123', 10000);

      expect(error.name).toBe('SandboxReadyTimeoutError');
      expect(error.message).toBe('Sandbox sandbox-123 did not become ready within 10000ms');
      expect(error.code).toBe('READY_TIMEOUT');
    });

    it('should format message with different sandbox IDs', () => {
      const error = new SandboxReadyTimeoutError('test-sandbox', 5000);
      expect(error.message).toContain('test-sandbox');
      expect(error.message).toContain('5000ms');
    });

    it('should use correct error code', () => {
      const error = new SandboxReadyTimeoutError('id', 1000);
      expect(error.code).toBe('READY_TIMEOUT');
    });
  });

  describe('prototype chain', () => {
    it('should be instance of SandboxReadyTimeoutError', () => {
      const error = new SandboxReadyTimeoutError('id', 1000);
      expect(error).toBeInstanceOf(SandboxReadyTimeoutError);
    });

    it('should be instance of Error', () => {
      const error = new SandboxReadyTimeoutError('id', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
