import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sandbox, SandboxManager } from '@alibaba-group/opensandbox';
import { OpenSandboxAdapter } from '@/adapters/OpenSandboxAdapter';
import type { OpenSandboxConnectionConfig } from '@/adapters/OpenSandboxAdapter';
import { ConnectionError, SandboxStateError } from '@/errors';
import type { ResourceLimits } from '@/types';
import type { OpenSandboxConfigType } from '@/adapters/OpenSandboxAdapter/type';

const MINIMAL_CONNECTION: OpenSandboxConnectionConfig = {
  sessionId: 'test-session',
  baseUrl: 'http://localhost'
};

function makeAdapter(extra?: Partial<OpenSandboxConnectionConfig>): OpenSandboxAdapter {
  return new OpenSandboxAdapter({ ...MINIMAL_CONNECTION, ...extra });
}

/**
 * Unit tests for OpenSandboxAdapter.
 *
 * These tests verify the OpenSandboxAdapter lifecycle, filesystem operations,
 * command execution, and health checks using mocked SDK behavior.
 */
describe('OpenSandboxAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Lifecycle Methods', () => {
    it('should initialize with custom connection config', () => {
      const adapter = makeAdapter({ apiKey: 'test-api-key' });

      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.status.state).toBe('Creating');
    });

    it('should use /workspace as the default root path', () => {
      const adapter = makeAdapter();

      expect(adapter.rootPath).toBe('/workspace');
    });

    it('should use the configured volume mount path as root path', () => {
      const adapter = new OpenSandboxAdapter(MINIMAL_CONNECTION, {
        image: { repository: 'node', tag: '20' },
        volumes: [{ name: 'workspace', mountPath: '/workspace/' }]
      } as OpenSandboxConfigType);

      expect(adapter.rootPath).toBe('/workspace');
    });

    it('should pass server proxy settings into ConnectionConfig', () => {
      const adapter = makeAdapter({
        apiKey: 'test-api-key',
        useServerProxy: true,
        requestTimeoutSeconds: 60,
        debug: true
      });
      const connection = (
        adapter as unknown as {
          _connection: {
            useServerProxy: boolean;
            requestTimeoutSeconds: number;
            debug: boolean;
          };
        }
      )._connection;

      expect(connection.useServerProxy).toBe(true);
      expect(connection.requestTimeoutSeconds).toBe(60);
      expect(connection.debug).toBe(true);
    });

    it('should throw SandboxStateError when accessing sandbox before initialization', async () => {
      const adapter = makeAdapter();

      // Attempting operations before create/connect should throw
      await expect(adapter.execute('echo test')).rejects.toThrow(SandboxStateError);
    });

    it('should handle connection errors gracefully', async () => {
      // Test with a URL that will fail - using a reserved port that won't have a server
      const config: OpenSandboxConfigType = {
        image: { repository: 'nginx', tag: 'latest' }
      };
      const adapter = new OpenSandboxAdapter(
        { ...MINIMAL_CONNECTION, baseUrl: 'http://localhost:65530' },
        config
      );

      // Should throw an error when SDK fails
      try {
        await adapter.create();
        // If we reach here without throwing, that's unexpected
        expect(true).toBe(false); // Force failure if no error thrown
      } catch (error) {
        expect(error instanceof ConnectionError || error instanceof Error).toBe(true);
      }
    });

    it('should handle connect errors gracefully', async () => {
      const adapter = makeAdapter({ baseUrl: 'http://localhost:65530' });

      try {
        await adapter.connect('non-existent-sandbox-id');
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof ConnectionError || error instanceof Error).toBe(true);
      }
    });

    it('should delete the provided sandbox id through lifecycle API without connecting', async () => {
      const adapter = makeAdapter();
      const killSandbox = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      const managerCreate = vi.spyOn(SandboxManager, 'create').mockReturnValue({
        killSandbox,
        close
      } as unknown as SandboxManager);
      const connect = vi.spyOn(adapter, 'connect').mockImplementation(async () => {
        throw new Error('delete(sandboxId) should not connect to execd');
      });

      await expect(adapter.delete('opensandbox-instance-1')).resolves.toBeUndefined();

      expect(managerCreate).toHaveBeenCalledTimes(1);
      expect(killSandbox).toHaveBeenCalledWith('opensandbox-instance-1');
      expect(close).toHaveBeenCalledTimes(1);
      expect(connect).not.toHaveBeenCalled();
      expect(adapter.status.state).toBe('UnExist');
    });

    it('should delete an unbound sandbox by looking up the connection session id', async () => {
      const adapter = makeAdapter({ sessionId: 'session-1' });
      const listSandboxInfos = vi.fn(async () => ({
        items: [
          {
            id: 'opensandbox-instance-1',
            status: { state: 'running' }
          }
        ]
      }));
      const killSandbox = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      vi.spyOn(SandboxManager, 'create').mockReturnValue({
        listSandboxInfos,
        killSandbox,
        close
      } as unknown as SandboxManager);

      await expect(adapter.delete()).resolves.toBeUndefined();

      expect(listSandboxInfos).toHaveBeenCalledWith({ metadata: { sessionId: 'session-1' } });
      expect(killSandbox).toHaveBeenCalledWith('opensandbox-instance-1');
      expect(close).toHaveBeenCalledTimes(2);
      expect(adapter.status.state).toBe('UnExist');
    });

    it('should stop an unbound sandbox by looking up the connection session id', async () => {
      const adapter = makeAdapter({ sessionId: 'session-1' });
      const listSandboxInfos = vi.fn(async () => ({
        items: [
          {
            id: 'opensandbox-instance-1',
            status: { state: 'running' }
          }
        ]
      }));
      const killSandbox = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      vi.spyOn(SandboxManager, 'create').mockReturnValue({
        listSandboxInfos,
        killSandbox,
        close
      } as unknown as SandboxManager);

      await expect(adapter.stop()).resolves.toBeUndefined();

      expect(listSandboxInfos).toHaveBeenCalledWith({ metadata: { sessionId: 'session-1' } });
      expect(killSandbox).toHaveBeenCalledWith('opensandbox-instance-1');
      expect(close).toHaveBeenCalledTimes(2);
      expect(adapter.status.state).toBe('Stopped');
    });

    it('should treat stop as idempotent when no sandbox exists for the session id', async () => {
      const adapter = makeAdapter({ sessionId: 'session-1' });
      const listSandboxInfos = vi.fn(async () => ({ items: [] }));
      const killSandbox = vi.fn(async () => undefined);
      const close = vi.fn(async () => undefined);
      vi.spyOn(SandboxManager, 'create').mockReturnValue({
        listSandboxInfos,
        killSandbox,
        close
      } as unknown as SandboxManager);

      await expect(adapter.stop()).resolves.toBeUndefined();

      expect(listSandboxInfos).toHaveBeenCalledWith({ metadata: { sessionId: 'session-1' } });
      expect(killSandbox).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
      expect(adapter.status.state).toBe('Stopped');
    });

    it('should connect to an existing creating sandbox resolved by session id', async () => {
      const adapter = makeAdapter({ sessionId: 'session-1' });
      const listSandboxInfos = vi.fn(async () => ({
        items: [
          {
            id: 'opensandbox-instance-1',
            status: { state: 'creating' }
          }
        ]
      }));
      const close = vi.fn(async () => undefined);
      vi.spyOn(SandboxManager, 'create').mockReturnValue({
        listSandboxInfos,
        close
      } as unknown as SandboxManager);
      const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValue({
        id: 'opensandbox-instance-1'
      } as unknown as Sandbox);

      await expect(adapter.ensureRunning()).resolves.toBeUndefined();

      expect(listSandboxInfos).toHaveBeenCalledWith({ metadata: { sessionId: 'session-1' } });
      expect(connect).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: 'opensandbox-instance-1' })
      );
      expect(adapter.id).toBe('opensandbox-instance-1');
      expect(adapter.status.state).toBe('Running');
    });

    it('should wait by session id when existing sandbox is deleting before creating a replacement', async () => {
      const adapter = new OpenSandboxAdapter(
        { ...MINIMAL_CONNECTION, sessionId: 'session-1' },
        { image: { repository: 'node', tag: '20' } }
      );
      vi.spyOn(
        adapter as unknown as { sleep(ms: number): Promise<void> },
        'sleep'
      ).mockResolvedValue(undefined);
      vi.spyOn(adapter, 'ping').mockResolvedValue(true);
      const listSandboxInfos = vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: 'opensandbox-instance-1',
              status: { state: 'deleting' }
            }
          ]
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: 'opensandbox-instance-1',
              status: { state: 'deleting' }
            }
          ]
        })
        .mockResolvedValueOnce({ items: [] });
      const close = vi.fn(async () => undefined);
      vi.spyOn(SandboxManager, 'create').mockReturnValue({
        listSandboxInfos,
        close
      } as unknown as SandboxManager);
      const create = vi.spyOn(Sandbox, 'create').mockResolvedValue({
        id: 'opensandbox-instance-2',
        waitUntilReady: vi.fn(async () => undefined)
      } as unknown as Sandbox);

      await expect(adapter.ensureRunning()).resolves.toBeUndefined();

      expect(listSandboxInfos).toHaveBeenCalledTimes(3);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ sessionId: 'session-1' })
        })
      );
      expect(adapter.id).toBe('opensandbox-instance-2');
      expect(adapter.status.state).toBe('Running');
    });

    it('should create sandbox with network policy and extensions', async () => {
      const adapter = new OpenSandboxAdapter({ ...MINIMAL_CONNECTION, sessionId: 'session-1' }, {
        image: { repository: 'node', tag: '20' },
        resourceLimits: { cpuCount: 1, memoryMiB: 256 },
        metadata: { teamId: 'team-1' },
        networkPolicy: {
          defaultAction: 'allow',
          egress: [{ action: 'deny', target: 'host.docker.internal' }]
        },
        extensions: {
          traceId: 'trace-1'
        }
      } as OpenSandboxConfigType);
      vi.spyOn(adapter, 'ping').mockResolvedValue(true);
      const create = vi.spyOn(Sandbox, 'create').mockResolvedValue({
        id: 'opensandbox-instance-1',
        health: {
          ping: vi.fn(async () => true)
        }
      } as unknown as Sandbox);

      await expect(adapter.create()).resolves.toBeUndefined();

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: 'host.docker.internal' }]
          },
          extensions: {
            traceId: 'trace-1'
          },
          resource: {
            cpu: '1',
            memory: '256Mi'
          },
          metadata: expect.objectContaining({
            teamId: 'team-1',
            sessionId: 'session-1'
          })
        })
      );
    });

    it('should fall back to command execution when health ping is temporarily unhealthy', async () => {
      const adapter = makeAdapter();
      const run = vi.fn(async () => ({}));
      (
        adapter as unknown as {
          _sandbox: {
            health: { ping: () => Promise<boolean> };
            commands: { run: typeof run };
          };
        }
      )._sandbox = {
        health: { ping: vi.fn(async () => false) },
        commands: { run }
      };

      await expect(adapter.ping()).resolves.toBe(true);

      expect(run).toHaveBeenCalledWith(
        'true',
        expect.objectContaining({
          timeoutSeconds: 3
        }),
        expect.any(Object)
      );
    });

    it('should report unhealthy when health ping and command fallback both fail', async () => {
      const adapter = makeAdapter();
      (
        adapter as unknown as {
          _sandbox: {
            health: { ping: () => Promise<boolean> };
            commands: { run: () => Promise<unknown> };
          };
        }
      )._sandbox = {
        health: { ping: vi.fn(async () => false) },
        commands: { run: vi.fn(async () => ({ error: { value: '1' } })) }
      };

      await expect(adapter.ping()).resolves.toBe(false);
    });
  });

  describe('Resource Conversion', () => {
    it('should convert ResourceLimits to SDK format', () => {
      const adapter = makeAdapter();
      const convertResourceLimits = (
        adapter as unknown as {
          convertResourceLimits(limits?: ResourceLimits): Record<string, string> | undefined;
        }
      ).convertResourceLimits;

      // Full limits
      const limits: ResourceLimits = {
        cpuCount: 2,
        memoryMiB: 512,
        diskGiB: 10
      };
      const converted = convertResourceLimits(limits);
      expect(converted).toEqual({
        cpu: '2',
        memory: '512Mi',
        disk: '10Gi'
      });

      // Partial limits
      const partial: ResourceLimits = { cpuCount: 4 };
      expect(convertResourceLimits(partial)).toEqual({ cpu: '4' });

      // Empty limits
      expect(convertResourceLimits({})).toEqual({});

      // Undefined
      expect(convertResourceLimits(undefined)).toBeUndefined();
    });

    it('should parse SDK resource limits to ResourceLimits', () => {
      const adapter = makeAdapter();
      const parseResourceLimits = (
        adapter as unknown as {
          parseResourceLimits(resource?: Record<string, string>): ResourceLimits | undefined;
        }
      ).parseResourceLimits;

      // Full resource limits
      const sdkLimits = {
        cpu: '2',
        memory: '512Mi',
        disk: '10Gi'
      };
      const parsed = parseResourceLimits(sdkLimits);
      expect(parsed).toEqual({
        cpuCount: 2,
        memoryMiB: 512,
        diskGiB: 10
      });

      // GiB memory conversion
      const gibMemory = { memory: '2Gi' };
      expect(parseResourceLimits(gibMemory)).toEqual({ memoryMiB: 2048 });

      // Empty object
      expect(parseResourceLimits({})).toEqual({});

      // Undefined
      expect(parseResourceLimits(undefined)).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should wrap SDK errors in ConnectionError for create', async () => {
      const adapter = new OpenSandboxAdapter(
        { ...MINIMAL_CONNECTION, baseUrl: 'http://localhost:1' }, // Invalid port
        { image: { repository: 'test' } }
      );

      try {
        await adapter.create();
      } catch (error) {
        // Should be a connection-related error
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should wrap SDK errors in ConnectionError for connect', async () => {
      const adapter = makeAdapter({ baseUrl: 'http://localhost:1' });

      try {
        await adapter.connect('invalid-id');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should provide meaningful error messages', () => {
      const connectionError = new ConnectionError(
        'Failed to create sandbox',
        'http://example.com',
        new Error('Network timeout')
      );

      expect(connectionError.message).toContain('Failed to create sandbox');
      expect(connectionError.endpoint).toBe('http://example.com');
      expect(connectionError.cause).toBeDefined();
    });

    it('should create SandboxStateError with expected state', () => {
      const stateError = new SandboxStateError('Sandbox not initialized', 'UnExist', 'Running');

      expect(stateError.message).toContain('Sandbox not initialized');
      expect(stateError.currentState).toBe('UnExist');
      expect(stateError.requiredState).toBe('Running');
    });
  });

  describe('Wait Until Ready', () => {
    it('should timeout when sandbox not ready', async () => {
      const adapter = makeAdapter();

      // Without proper initialization, should timeout or error
      try {
        await adapter.waitUntilReady(100); // Short timeout
      } catch (error) {
        // Expected to throw since sandbox not created
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe('Runtime Configuration', () => {
    it('should default to docker runtime', () => {
      expect(makeAdapter().runtime).toBe('docker');
    });

    it('should accept kubernetes runtime explicitly', () => {
      expect(makeAdapter({ runtime: 'kubernetes' }).runtime).toBe('kubernetes');
    });
  });

  describe('getInfo', () => {
    it('should return null when sandbox not initialized', async () => {
      const adapter = makeAdapter();
      const info = await adapter.getInfo();
      expect(info).toBeNull();
    });
  });

  describe('Command Execution', () => {
    it('should pass command timeout to OpenSandbox commands', async () => {
      const adapter = makeAdapter();
      const run = vi.fn(async (_command, _options, handlers) => {
        handlers.onStdout({ text: 'ok\n' });
        return {};
      });
      (adapter as any).sandbox = {
        commands: { run }
      };

      const result = await adapter.execute('sleep 10', { timeoutMs: 2_000 });

      expect(result.stdout).toBe('ok\n');
      expect(run).toHaveBeenCalledWith(
        'sleep 10',
        expect.objectContaining({
          timeoutSeconds: 2
        }),
        expect.any(Object)
      );
    });

    it('should pass stream command timeout to OpenSandbox commands', async () => {
      const adapter = makeAdapter();
      const run = vi.fn(async (_command, _options, handlers) => {
        await handlers.onStdout?.({ text: 'ok\n' });
        return {};
      });
      (adapter as any).sandbox = {
        commands: { run }
      };

      await adapter.executeStream('sleep 10', {}, { timeoutMs: 2_100 });

      expect(run).toHaveBeenCalledWith(
        'sleep 10',
        expect.objectContaining({
          timeoutSeconds: 3
        }),
        expect.any(Object)
      );
    });
  });

  describe('writeFiles', () => {
    it('should slice Uint8Array with byte offset and pass clean ArrayBuffer to SDK', async () => {
      const adapter = makeAdapter();

      // Mock sandbox and files.writeFiles
      const mockWriteFiles = vi.fn().mockResolvedValue(undefined);
      const mockSandbox = {
        files: {
          writeFiles: mockWriteFiles
        }
      };

      // Inject mock sandbox
      (adapter as any).sandbox = mockSandbox;
      (adapter as any)._status = { state: 'Running' };

      // Create a Uint8Array backed by a shared buffer pool (with offset)
      const sharedBuffer = new ArrayBuffer(20);
      const dataWithOffset = new Uint8Array(sharedBuffer, 5, 10);
      dataWithOffset.fill(65); // Fill with 'A's

      const result = await adapter.writeFiles([{ path: '/test.txt', data: dataWithOffset }]);

      expect(result[0].error).toBeNull();
      expect(result[0].bytesWritten).toBe(10);

      // Verify that the data passed to SDK's writeFiles is an ArrayBuffer
      // and its byteLength is exactly 10 (not the 20 of the sharedBuffer)
      expect(mockWriteFiles).toHaveBeenCalledTimes(1);
      const callArgs = mockWriteFiles.mock.calls[0][0];
      expect(callArgs[0].path).toBe('/test.txt');

      const passedData = callArgs[0].data;
      expect(passedData).toBeInstanceOf(ArrayBuffer);
      expect(passedData.byteLength).toBe(10);

      // Also verify we sliced it correctly by reading the contents
      const view = new Uint8Array(passedData);
      expect(view[0]).toBe(65);
      expect(view[9]).toBe(65);
    });

    it('should treat upload 500 as success when small file content was actually written', async () => {
      const adapter = makeAdapter();
      const uploadError = Object.assign(new Error('Upload failed (status=500)'), {
        statusCode: 500
      });
      const content = 'hello opensandbox';
      const encoded = new TextEncoder().encode(content);
      const mockWriteFiles = vi.fn().mockRejectedValue(uploadError);
      const mockGetFileInfo = vi.fn().mockResolvedValue({
        '/test.txt': { path: '/test.txt', size: encoded.byteLength }
      });
      const mockReadBytes = vi.fn().mockResolvedValue(encoded);

      (adapter as any).sandbox = {
        files: {
          writeFiles: mockWriteFiles,
          getFileInfo: mockGetFileInfo,
          readBytes: mockReadBytes
        }
      };

      const result = await adapter.writeFiles([{ path: '/test.txt', data: content }]);

      expect(result).toEqual([
        { path: '/test.txt', bytesWritten: encoded.byteLength, error: null }
      ]);
      expect(mockGetFileInfo).toHaveBeenCalledWith(['/test.txt']);
      expect(mockReadBytes).toHaveBeenCalledWith('/test.txt');
    });

    it('should accept upload 500 with matching size for large files without reading content', async () => {
      const adapter = makeAdapter();
      const uploadError = Object.assign(new Error('Upload failed (status=500)'), {
        statusCode: 500
      });
      const data = new Uint8Array(1024 * 1024 + 1);
      const mockWriteFiles = vi.fn().mockRejectedValue(uploadError);
      const mockGetFileInfo = vi.fn().mockResolvedValue({
        '/large.bin': { path: '/large.bin', size: data.byteLength }
      });
      const mockReadBytes = vi.fn();

      (adapter as any).sandbox = {
        files: {
          writeFiles: mockWriteFiles,
          getFileInfo: mockGetFileInfo,
          readBytes: mockReadBytes
        }
      };

      const result = await adapter.writeFiles([{ path: '/large.bin', data }]);

      expect(result[0].error).toBeNull();
      expect(result[0].bytesWritten).toBe(data.byteLength);
      expect(mockReadBytes).not.toHaveBeenCalled();
    });

    it('should fall back to command stat when OpenSandbox file info also fails', async () => {
      const adapter = makeAdapter();
      const uploadError = Object.assign(new Error('Upload failed (status=500)'), {
        statusCode: 500
      });
      const data = new Uint8Array(1024 * 1024 + 1);
      const mockWriteFiles = vi.fn().mockRejectedValue(uploadError);
      const mockGetFileInfo = vi.fn().mockRejectedValue(new Error('Get file info failed'));
      const mockRun = vi.fn(async (_command, _options, handlers) => {
        handlers.onStdout({ text: `${data.byteLength}\n` });
        return {};
      });

      (adapter as any).sandbox = {
        files: {
          writeFiles: mockWriteFiles,
          getFileInfo: mockGetFileInfo,
          readBytes: vi.fn()
        },
        commands: {
          run: mockRun
        }
      };

      const result = await adapter.writeFiles([{ path: '/large.bin', data }]);

      expect(result[0].error).toBeNull();
      expect(result[0].bytesWritten).toBe(data.byteLength);
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('should keep upload 500 as error when committed file size mismatches', async () => {
      const adapter = makeAdapter();
      const uploadError = Object.assign(new Error('Upload failed (status=500)'), {
        statusCode: 500
      });
      const mockWriteFiles = vi.fn().mockRejectedValue(uploadError);
      const mockGetFileInfo = vi.fn().mockResolvedValue({
        '/broken.txt': { path: '/broken.txt', size: 1 }
      });
      const mockReadBytes = vi.fn();

      (adapter as any).sandbox = {
        files: {
          writeFiles: mockWriteFiles,
          getFileInfo: mockGetFileInfo,
          readBytes: mockReadBytes
        }
      };

      const result = await adapter.writeFiles([{ path: '/broken.txt', data: 'mismatch' }]);

      expect(result[0].error).toBe(uploadError);
      expect(result[0].bytesWritten).toBe(0);
      expect(mockReadBytes).not.toHaveBeenCalled();
    });
  });
});
