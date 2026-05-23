import { describe, expect, it } from 'vitest';
import { CommandExecutionError } from '@/errors/CommandExecutionError';

describe('CommandExecutionError', () => {
  describe('constructor with exit code', () => {
    it('should create error with exit code, stdout, and stderr', () => {
      const error = new CommandExecutionError(
        'Command failed',
        'npm install',
        1,
        'output text',
        'error text'
      );

      expect(error.name).toBe('CommandExecutionError');
      expect(error.message).toBe('Command failed');
      expect(error.command).toBe('npm install');
      expect(error.exitCode).toBe(1);
      expect(error.stdout).toBe('output text');
      expect(error.stderr).toBe('error text');
      expect(error.commandError).toBeUndefined();
      expect(error.code).toBe('COMMAND_FAILED');
    });

    it('should create error with exit code only', () => {
      const error = new CommandExecutionError('Command failed', 'ls /nonexistent', 2);

      expect(error.exitCode).toBe(2);
      expect(error.stdout).toBeUndefined();
      expect(error.stderr).toBeUndefined();
      expect(error.commandError).toBeUndefined();
    });

    it('should create error without exit code', () => {
      const error = new CommandExecutionError('Command failed', 'echo test');

      expect(error.exitCode).toBeUndefined();
      expect(error.stdout).toBeUndefined();
      expect(error.stderr).toBeUndefined();
      expect(error.commandError).toBeUndefined();
    });
  });

  describe('constructor with Error cause', () => {
    it('should create error with Error as cause', () => {
      const cause = new Error('Connection timeout');
      const error = new CommandExecutionError('Command failed', 'npm install', cause);

      expect(error.commandError).toBe(cause);
      expect(error.exitCode).toBeUndefined();
      expect(error.stdout).toBeUndefined();
      expect(error.stderr).toBeUndefined();
      expect(error.cause).toBe(cause);
    });

    it('should preserve Error cause in prototype chain', () => {
      const cause = new TypeError('Invalid command');
      const error = new CommandExecutionError('Command failed', 'invalid', cause);

      expect(error.commandError).toBeInstanceOf(TypeError);
      expect(error.commandError?.message).toBe('Invalid command');
    });
  });

  describe('getCombinedOutput', () => {
    it('should return empty string when no output', () => {
      const error = new CommandExecutionError('Failed', 'cmd', 1);
      expect(error.getCombinedOutput()).toBe('');
    });

    it('should return stdout only when stderr is empty', () => {
      const error = new CommandExecutionError('Failed', 'cmd', 1, 'stdout text', '');
      expect(error.getCombinedOutput()).toBe('stdout text');
    });

    it('should return stderr only when stdout is empty', () => {
      const error = new CommandExecutionError('Failed', 'cmd', 1, '', 'stderr text');
      expect(error.getCombinedOutput()).toBe('stderr text');
    });

    it('should combine stdout and stderr with newline', () => {
      const error = new CommandExecutionError('Failed', 'cmd', 1, 'stdout text', 'stderr text');
      expect(error.getCombinedOutput()).toBe('stdout text\nstderr text');
    });

    it('should handle undefined stdout with defined stderr', () => {
      const error = new CommandExecutionError('Failed', 'cmd', 1, undefined, 'stderr text');
      expect(error.getCombinedOutput()).toBe('stderr text');
    });
  });

  describe('prototype chain', () => {
    it('should be instance of CommandExecutionError', () => {
      const error = new CommandExecutionError('Failed', 'cmd');
      expect(error).toBeInstanceOf(CommandExecutionError);
    });

    it('should be instance of Error', () => {
      const error = new CommandExecutionError('Failed', 'cmd');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
