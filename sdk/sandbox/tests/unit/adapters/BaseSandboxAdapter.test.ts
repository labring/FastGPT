import { beforeEach, describe, expect, it } from 'vitest';
import { FeatureNotSupportedError } from '../../../src/errors';
import { createFullCapabilities, createMinimalCapabilities } from '../../../src/types';
import { MockSandboxAdapter } from '../../mocks/MockSandboxAdapter';

describe('BaseSandboxAdapter', () => {
  describe('with full capabilities (native filesystem)', () => {
    let adapter: MockSandboxAdapter;

    beforeEach(() => {
      adapter = new MockSandboxAdapter(createFullCapabilities());
      adapter.setFile('/test.txt', new TextEncoder().encode('Hello'));
    });

    it('should report full capabilities', () => {
      expect(adapter.capabilities.nativeFileSystem).toBe(true);
      expect(adapter.capabilities.supportsStreamingOutput).toBe(true);
      expect(adapter.capabilities.supportsBatchOperations).toBe(true);
    });

    it('should use native readFiles', async () => {
      const results = await adapter.readFiles(['/test.txt']);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
      expect(new TextDecoder().decode(results[0].content)).toBe('Hello');
    });

    it('should use native writeFiles', async () => {
      const results = await adapter.writeFiles([{ path: '/new.txt', data: 'World' }]);
      expect(results[0].error).toBeNull();
      expect(results[0].bytesWritten).toBe(5);

      const readBack = await adapter.readFiles(['/new.txt']);
      expect(new TextDecoder().decode(readBack[0].content)).toBe('World');
    });

    it('should execute commands natively', async () => {
      const result = await adapter.execute('echo test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('echo test');
    });

    it('should support streaming when capability is present', async () => {
      const stdoutChunks: string[] = [];

      await adapter.executeStream('echo streaming', {
        onStdout: (msg) => stdoutChunks.push(msg.text)
      });

      expect(stdoutChunks.length).toBeGreaterThan(0);
    });

    it('should throw FeatureNotSupportedError for unsupported pause', async () => {
      // Create adapter with pause disabled
      const caps = createFullCapabilities();
      caps.supportsPauseResume = false;
      const limitedAdapter = new MockSandboxAdapter(caps);

      try {
        await limitedAdapter.pause();
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(FeatureNotSupportedError);
        expect((error as FeatureNotSupportedError).feature).toBe('pause');
      }
    });

    it('should throw FeatureNotSupportedError for unsupported background execution', async () => {
      const caps = createFullCapabilities();
      caps.supportsBackgroundExecution = false;
      const limitedAdapter = new MockSandboxAdapter(caps);

      try {
        await limitedAdapter.executeBackground('sleep 10');
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(FeatureNotSupportedError);
      }
    });
  });

  describe('with minimal capabilities (polyfilled filesystem)', () => {
    let adapter: MockSandboxAdapter;

    beforeEach(() => {
      adapter = new MockSandboxAdapter(createMinimalCapabilities());
    });

    it('should report no native filesystem', () => {
      expect(adapter.capabilities.nativeFileSystem).toBe(false);
      expect(adapter.capabilities.supportsStreamingTransfer).toBe(false);
    });

    it('should route readFiles through polyfill', async () => {
      // With minimal capabilities, polyfill service should be used
      // The polyfill will try to execute cat commands
      const result = await adapter.readFiles(['/any.txt']);
      // Polyfill will fail because no mock command is set up
      expect(result[0].error).not.toBeNull();
    });

    it('should route writeFiles through polyfill', async () => {
      const results = await adapter.writeFiles([{ path: '/test.txt', data: 'content' }]);
      // Polyfill will fail because no mock command is set up
      expect(results[0].error).not.toBeNull();
    });

    it('should use fallback for streaming when not supported', async () => {
      const stdoutChunks: string[] = [];

      await adapter.executeStream('echo test', {
        onStdout: (msg) => stdoutChunks.push(msg.text)
      });

      // Should still work via fallback (execute + call handlers)
      expect(stdoutChunks.length).toBeGreaterThan(0);
    });

    it('should ping via polyfill', async () => {
      // With minimal capabilities, ping goes through polyfill
      const result = await adapter.ping();
      // Should work via the echo PING fallback
      expect(typeof result).toBe('boolean');
    });
  });

  describe('waitUntilReady', () => {
    it('should resolve when sandbox is ready', async () => {
      const adapter = new MockSandboxAdapter();
      // Mock adapter's nativePing always returns true
      await adapter.waitUntilReady(5000);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('capabilities', () => {
    it('should allow checking individual capabilities', () => {
      const adapter = new MockSandboxAdapter();
      expect(adapter.capabilities.nativeFileSystem).toBe(true);
      expect(adapter.capabilities.nativeHealthCheck).toBe(true);
    });
  });
});
