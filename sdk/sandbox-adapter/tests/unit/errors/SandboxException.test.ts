import { describe, expect, it } from 'vitest';
import { SandboxException } from '@/errors/SandboxException';

describe('SandboxException', () => {
  describe('constructor', () => {
    it('should create exception with default code', () => {
      const error = new SandboxException('Something went wrong');

      expect(error.name).toBe('SandboxException');
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('INTERNAL_UNKNOWN_ERROR');
      expect(error.cause).toBeUndefined();
    });

    it('should create exception with custom code', () => {
      const error = new SandboxException('Connection failed', 'CONNECTION_ERROR');

      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toBe('Connection failed');
    });

    it('should create exception with cause', () => {
      const cause = new Error('Network timeout');
      const error = new SandboxException('Operation failed', 'TIMEOUT', cause);

      expect(error.cause).toBe(cause);
      expect(error.code).toBe('TIMEOUT');
    });
  });

  describe('toJSON', () => {
    it('should return structured JSON representation', () => {
      const error = new SandboxException('Test error', 'FILE_NOT_FOUND');
      const json = error.toJSON();

      expect(json).toHaveProperty('name', 'SandboxException');
      expect(json).toHaveProperty('message', 'Test error');
      expect(json).toHaveProperty('code', 'FILE_NOT_FOUND');
      expect(json).toHaveProperty('stack');
      expect(json.stack).toBeDefined();
    });

    it('should include cause in JSON when present', () => {
      const cause = new Error('Root cause');
      const error = new SandboxException('Wrapper error', 'CONNECTION_ERROR', cause);
      const json = error.toJSON();

      expect(json).toHaveProperty('cause');
      expect(json.cause).toBe(cause);
    });

    it('should have undefined cause when not provided', () => {
      const error = new SandboxException('Simple error');
      const json = error.toJSON();

      expect(json).toHaveProperty('cause');
      expect(json.cause).toBeUndefined();
    });
  });

  describe('prototype chain', () => {
    it('should be instance of SandboxException', () => {
      const error = new SandboxException('Test');
      expect(error).toBeInstanceOf(SandboxException);
    });

    it('should be instance of Error', () => {
      const error = new SandboxException('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('error codes', () => {
    it('should support all predefined error codes', () => {
      const codes = [
        'INTERNAL_UNKNOWN_ERROR',
        'CONNECTION_ERROR',
        'TIMEOUT',
        'READY_TIMEOUT',
        'UNHEALTHY',
        'INVALID_ARGUMENT',
        'UNEXPECTED_RESPONSE',
        'FEATURE_NOT_SUPPORTED',
        'SANDBOX_NOT_FOUND',
        'PERMISSION_DENIED',
        'FILE_NOT_FOUND',
        'FILE_ALREADY_EXISTS',
        'COMMAND_FAILED'
      ] as const;

      codes.forEach((code) => {
        const error = new SandboxException('Test', code);
        expect(error.code).toBe(code);
      });
    });
  });
});
