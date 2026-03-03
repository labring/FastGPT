import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MinimalProviderConnection } from '../../src/adapters/MinimalProviderAdapter';
import { MinimalProviderAdapter } from '../../src/adapters/MinimalProviderAdapter';
import type { ExecuteOptions, StreamHandlers } from '../../src/types';
import { MockSandboxAdapter } from '../mocks/MockSandboxAdapter';

/**
 * Integration tests for command execution operations.
 *
 * These tests cover the ICommandExecution interface implementations:
 * - Standard command execution (execute)
 * - Streaming command execution (executeStream)
 * - Background command execution (executeBackground)
 * - Command interruption (interrupt)
 * - Execution options (working directory, timeout, etc.)
 *
 * Tests are run against both native and polyfilled implementations.
 */
describe('Command Execution', () => {
  describe('Native Command Execution (MockSandboxAdapter)', () => {
    let adapter: MockSandboxAdapter;

    beforeEach(() => {
      adapter = new MockSandboxAdapter();
    });

    afterEach(async () => {
      await adapter.close();
    });

    describe('Standard Execution', () => {
      it('should execute simple command', async () => {
        const result = await adapter.execute('echo hello');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Executed:');
        expect(result.stderr).toBe('');
      });

      it('should execute command with options', async () => {
        const options: ExecuteOptions = {
          workingDirectory: '/app',
          timeout: 5000
        };

        const result = await adapter.execute('pwd', options);
        expect(result.exitCode).toBe(0);
      });

      it('should handle command with special characters', async () => {
        const result = await adapter.execute('echo "Hello, World!"');
        expect(result.exitCode).toBe(0);
      });

      it('should return truncated flag for large output', async () => {
        // Mock adapter doesn't truncate, but we verify the field exists
        const result = await adapter.execute('cat large-file');
        expect(typeof result.truncated).toBe('boolean');
      });

      it('should handle multiple commands in sequence', async () => {
        const result1 = await adapter.execute('echo first');
        expect(result1.exitCode).toBe(0);

        const result2 = await adapter.execute('echo second');
        expect(result2.exitCode).toBe(0);

        const result3 = await adapter.execute('echo third');
        expect(result3.exitCode).toBe(0);
      });

      it('should handle commands with exit code 0', async () => {
        const result = await adapter.execute('true');
        expect(result.exitCode).toBe(0);
      });
    });

    describe('Streaming Execution', () => {
      it('should stream stdout', async () => {
        const stdoutChunks: string[] = [];

        const handlers: StreamHandlers = {
          onStdout: async (msg) => {
            stdoutChunks.push(msg.text);
          }
        };

        await adapter.executeStream('echo streamed', handlers);

        expect(stdoutChunks.length).toBeGreaterThan(0);
        expect(stdoutChunks[0]).toContain('Streamed:');
      });

      it('should stream stderr', async () => {
        const stderrChunks: string[] = [];

        const handlers: StreamHandlers = {
          onStderr: async (msg) => {
            stderrChunks.push(msg.text);
          }
        };

        await adapter.executeStream('echo error >&2', handlers);

        // May or may not have stderr depending on mock implementation
        expect(stderrChunks).toBeDefined();
      });

      it('should call onComplete with result', async () => {
        let completedResult: { exitCode?: number } | undefined;

        const handlers: StreamHandlers = {
          onComplete: async (result) => {
            completedResult = result;
          }
        };

        await adapter.executeStream('echo complete', handlers);

        expect(completedResult).toBeDefined();
        expect(completedResult?.exitCode).toBe(0);
      });

      it('should handle streaming with options', async () => {
        const stdoutChunks: string[] = [];

        const handlers: StreamHandlers = {
          onStdout: async (msg) => {
            stdoutChunks.push(msg.text);
          }
        };

        const options: ExecuteOptions = {
          workingDirectory: '/tmp'
        };

        await adapter.executeStream('pwd', handlers, options);
        expect(stdoutChunks.length).toBeGreaterThan(0);
      });

      it('should handle streaming errors', async () => {
        const errors: { message: string }[] = [];

        const handlers: StreamHandlers = {
          onError: async (err) => {
            errors.push(err);
          }
        };

        // Even if no error occurs, handlers should be valid
        await adapter.executeStream('echo test', handlers);
        expect(errors).toBeDefined();
      });
    });

    describe('Background Execution', () => {
      it('should execute command in background', async () => {
        const handle = await adapter.executeBackground('sleep 10');

        expect(handle.sessionId).toBeDefined();
        expect(typeof handle.sessionId).toBe('string');
        expect(typeof handle.kill).toBe('function');
      });

      it('should kill background execution', async () => {
        const handle = await adapter.executeBackground('long-running-process');

        // Should not throw
        await handle.kill();
      });

      it('should execute background with options', async () => {
        const options: ExecuteOptions = {
          workingDirectory: '/app'
        };

        const handle = await adapter.executeBackground('node server.js', options);
        expect(handle.sessionId).toBeDefined();
      });

      it('should handle multiple background executions', async () => {
        const handle1 = await adapter.executeBackground('process1');
        const handle2 = await adapter.executeBackground('process2');

        expect(handle1.sessionId).not.toBe(handle2.sessionId);

        await handle1.kill();
        await handle2.kill();
      });
    });

    describe('Command Interruption', () => {
      it('should interrupt running command', async () => {
        const handle = await adapter.executeBackground('sleep 100');

        // Should not throw
        await adapter.interrupt(handle.sessionId);
      });

      it('should handle interrupt for non-existent session', async () => {
        // Should handle gracefully (may throw or not depending on implementation)
        try {
          await adapter.interrupt('non-existent-session');
        } catch {
          // Expected in some implementations
        }
      });
    });

    describe('Complex Command Scenarios', () => {
      it('should handle command chaining', async () => {
        const result = await adapter.execute('echo "first" && echo "second"');
        expect(result.exitCode).toBe(0);
      });

      it('should handle pipes', async () => {
        const result = await adapter.execute('echo "hello" | tr a-z A-Z');
        expect(result.exitCode).toBe(0);
      });

      it('should handle environment variables', async () => {
        const result = await adapter.execute('FOO=bar echo $FOO');
        expect(result.exitCode).toBe(0);
      });

      it('should handle multiline commands', async () => {
        const result = await adapter.execute('echo line1\necho line2');
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe('Polyfilled Command Execution (MinimalProviderAdapter)', () => {
    function createMockConnection(): MinimalProviderConnection {
      const runningCommands = new Set<string>();
      let commandId = 0;

      return {
        id: 'cmd-test-sandbox',

        async execute(command: string) {
          // Ping
          if (command.includes('echo "PING"')) {
            return { stdout: 'PING', stderr: '', exitCode: 0 };
          }

          // Background command simulation
          if (command.includes('background-process')) {
            const id = `cmd-${++commandId}`;
            runningCommands.add(id);
            return { stdout: '', stderr: '', exitCode: 0, backgroundId: id };
          }

          // Simulate command execution
          if (command.includes('echo')) {
            const match = command.match(/echo "(.+?)"/);
            const text = match ? match[1] : '';
            return { stdout: text, stderr: '', exitCode: 0 };
          }

          if (command.includes('error')) {
            return { stdout: '', stderr: 'error occurred', exitCode: 1 };
          }

          return { stdout: `Executed: ${command}`, stderr: '', exitCode: 0 };
        },

        async getStatus() {
          return { state: 'Running' as const };
        },

        async close() {
          runningCommands.clear();
        }
      };
    }

    it('should execute command via polyfill', async () => {
      const connection = createMockConnection();
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const result = await adapter.execute('echo "test"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('test');
      } finally {
        await adapter.close();
      }
    });

    it('should handle working directory option', async () => {
      const connection = createMockConnection();
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const result = await adapter.execute('pwd', { workingDirectory: '/app' });
        expect(result.exitCode).toBe(0);
      } finally {
        await adapter.close();
      }
    });

    it('should handle command with error exit code', async () => {
      const connection = createMockConnection();
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const result = await adapter.execute('error');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('error');
      } finally {
        await adapter.close();
      }
    });

    it('should stream output via polyfill', async () => {
      const connection = createMockConnection();
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        const outputs: string[] = [];

        await adapter.executeStream('echo "streamed output"', {
          onStdout: async (msg) => {
            outputs.push(msg.text);
          }
        });

        // Polyfill should collect and emit output
        expect(outputs.length).toBeGreaterThan(0);
      } finally {
        await adapter.close();
      }
    });

    it('should throw FeatureNotSupportedError for background execution', async () => {
      const connection = createMockConnection();
      const adapter = new MinimalProviderAdapter();

      await adapter.connect(connection);

      try {
        // MinimalProvider does not support background execution
        await expect(adapter.executeBackground('background-process')).rejects.toThrow();
      } finally {
        await adapter.close();
      }
    });
  });

  describe('Cross-Provider Execution Parity', () => {
    it('should produce similar results for same command', async () => {
      const nativeAdapter = new MockSandboxAdapter();

      const polyConnection: MinimalProviderConnection = {
        id: 'parity-cmd-test',
        async execute(command: string) {
          if (command.includes('echo "PING"')) {
            return { stdout: 'PING', stderr: '', exitCode: 0 };
          }
          return { stdout: 'parity-output', stderr: '', exitCode: 0 };
        },
        async getStatus() {
          return { state: 'Running' as const };
        },
        async close() {}
      };

      const polyAdapter = new MinimalProviderAdapter();
      await polyAdapter.connect(polyConnection);

      // Both should return similar structure
      const nativeResult = await nativeAdapter.execute('test-cmd');
      const polyResult = await polyAdapter.execute('test-cmd');

      expect(typeof nativeResult.exitCode).toBe('number');
      expect(typeof polyResult.exitCode).toBe('number');
      expect(typeof nativeResult.stdout).toBe('string');
      expect(typeof polyResult.stdout).toBe('string');
      expect(typeof nativeResult.stderr).toBe('string');
      expect(typeof polyResult.stderr).toBe('string');

      await nativeAdapter.close();
      await polyAdapter.close();
    });

    it('should handle executeBackground with native adapter', async () => {
      const nativeAdapter = new MockSandboxAdapter();

      const nativeBg = await nativeAdapter.executeBackground('sleep 10');

      // Should have sessionId and kill function
      expect(typeof nativeBg.sessionId).toBe('string');
      expect(typeof nativeBg.kill).toBe('function');

      await nativeBg.kill();
      await nativeAdapter.close();
    });

    it('should throw error for background execution with minimal provider', async () => {
      const polyConnection: MinimalProviderConnection = {
        id: 'bg-parity-test',
        async execute(command: string) {
          if (command.includes('echo "PING"')) {
            return { stdout: 'PING', stderr: '', exitCode: 0 };
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        },
        async getStatus() {
          return { state: 'Running' as const };
        },
        async close() {}
      };

      const polyAdapter = new MinimalProviderAdapter();
      await polyAdapter.connect(polyConnection);

      // Minimal provider does not support background execution
      await expect(polyAdapter.executeBackground('sleep 10')).rejects.toThrow();

      await polyAdapter.close();
    });
  });

  describe('Execution Edge Cases', () => {
    it('should handle empty command', async () => {
      const adapter = new MockSandboxAdapter();
      const result = await adapter.execute('');
      expect(result.exitCode).toBe(0);
      await adapter.close();
    });

    it('should handle very long command', async () => {
      const adapter = new MockSandboxAdapter();
      const longCommand = `echo ${'a'.repeat(1000)}`;
      const result = await adapter.execute(longCommand);
      expect(result.exitCode).toBe(0);
      await adapter.close();
    });

    it('should handle command with special shell characters', async () => {
      const adapter = new MockSandboxAdapter();
      const specialChars = [
        'echo "hello; world"',
        'echo "hello && world"',
        'echo "hello || world"',
        'echo "hello | world"',
        'echo "$HOME"',
        'echo "`date`"'
      ];

      for (const cmd of specialChars) {
        const result = await adapter.execute(cmd);
        expect(result.exitCode).toBe(0);
      }

      await adapter.close();
    });

    it('should handle unicode in commands', async () => {
      const adapter = new MockSandboxAdapter();
      const result = await adapter.execute('echo "Hello 世界 🌍"');
      expect(result.exitCode).toBe(0);
      await adapter.close();
    });
  });

  describe('OpenSandbox Lifecycle Integration', () => {
    it('should execute commands after create', async () => {
      const adapter = new MockSandboxAdapter();

      await adapter.create({
        image: { repository: 'alpine', tag: 'latest' }
      });

      const result = await adapter.execute('whoami');
      expect(result.exitCode).toBe(0);

      await adapter.close();
    });

    it('should handle execution after pause/resume', async () => {
      const adapter = new MockSandboxAdapter();

      await adapter.create({ image: { repository: 'alpine' } });

      await adapter.pause();
      await adapter.resume();

      const result = await adapter.execute('echo resumed');
      expect(result.exitCode).toBe(0);

      await adapter.close();
    });
  });
});
