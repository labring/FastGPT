import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sandbox,
  SandboxApiException,
  SandboxError,
  SandboxException,
  SandboxManager,
  type ExecutionHandlers,
  type FileInfo as SdkFileInfo,
  type SandboxInfo as SdkSandboxInfo,
  type WriteEntry as SdkWriteEntry
} from '@alibaba-group/opensandbox';
import {
  OpenSandboxAdapter,
  type OpenSandboxConnectionConfig
} from '@/adapters/OpenSandboxAdapter';
import {
  CommandExecutionError,
  FeatureNotSupportedError,
  SandboxNotFoundError,
  SandboxStateError
} from '@/errors';

const MINIMAL_CONNECTION: OpenSandboxConnectionConfig = {
  sessionId: 'test-session',
  baseUrl: 'http://localhost'
};

const NOT_FOUND_ERROR = new SandboxApiException({
  message: 'sandbox not found',
  statusCode: 404
});

const makeAdapter = ({
  connection,
  createConfig
}: {
  connection?: Partial<OpenSandboxConnectionConfig>;
  createConfig?: ConstructorParameters<typeof OpenSandboxAdapter>[1];
} = {}) => new OpenSandboxAdapter({ ...MINIMAL_CONNECTION, ...connection }, createConfig);

const makeSdkInfo = ({
  id = 'sandbox-1',
  state = 'Running',
  overrides = {}
}: {
  id?: string;
  state?: string;
  overrides?: Partial<SdkSandboxInfo> & Record<string, unknown>;
} = {}): SdkSandboxInfo =>
  ({
    id,
    image: { uri: 'node:20' },
    entrypoint: ['tail', '-f', '/dev/null'],
    metadata: { sessionId: MINIMAL_CONNECTION.sessionId },
    status: { state },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    ...overrides
  }) as SdkSandboxInfo;

const createSandboxMock = ({
  id = 'sandbox-1',
  infoSequence = [makeSdkInfo({ id })]
}: {
  id?: string;
  infoSequence?: Array<SdkSandboxInfo | Error>;
} = {}) => {
  const getInfo = vi.fn(async () => makeSdkInfo({ id }));
  for (const value of infoSequence) {
    getInfo.mockImplementationOnce(async () => {
      if (value instanceof Error) throw value;
      return value;
    });
  }

  const pause = vi.fn(async () => undefined);
  const kill = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const isHealthy = vi.fn(async () => true);
  const commandRun = vi.fn(
    async (_command: string, _options?: unknown, _handlers?: ExecutionHandlers) => ({
      logs: { stdout: [], stderr: [] },
      result: [],
      exitCode: 0
    })
  );
  const interrupt = vi.fn(async () => undefined);
  const readBytes = vi.fn(async () => new Uint8Array());
  const readBytesStream = vi.fn(async function* () {
    yield new Uint8Array();
  });
  const getFileInfo = vi.fn(async () => ({}));
  const writeFiles = vi.fn(async (_entries: SdkWriteEntry[]) => undefined);
  const deleteFiles = vi.fn(async () => undefined);
  const moveFiles = vi.fn(async () => undefined);
  const replaceContents = vi.fn(async () => undefined);
  const createDirectories = vi.fn(async () => undefined);
  const deleteDirectories = vi.fn(async () => undefined);
  const listDirectory = vi.fn(async (): Promise<SdkFileInfo[]> => []);
  const setPermissions = vi.fn(async () => undefined);
  const search = vi.fn(async () => []);
  const getEndpointUrl = vi.fn(async () => 'http://127.0.0.1:18080');

  const sandbox = {
    id,
    getInfo,
    pause,
    kill,
    close,
    isHealthy,
    commands: { run: commandRun, interrupt },
    files: {
      readBytes,
      readBytesStream,
      getFileInfo,
      writeFiles,
      deleteFiles,
      moveFiles,
      replaceContents,
      createDirectories,
      deleteDirectories,
      listDirectory,
      setPermissions,
      search
    },
    metrics: { getMetrics: vi.fn() },
    getEndpointUrl,
    renew: vi.fn()
  } as unknown as Sandbox;

  return {
    sandbox,
    getInfo,
    pause,
    kill,
    close,
    isHealthy,
    commandRun,
    interrupt,
    readBytes,
    readBytesStream,
    getFileInfo,
    writeFiles,
    listDirectory,
    getEndpointUrl
  };
};

const bindSandbox = (adapter: OpenSandboxAdapter, sandbox: Sandbox) => {
  const target = adapter as unknown as { _sandbox?: Sandbox };
  target._sandbox = sandbox;
};

const mockManager = ({
  items = [],
  infoSequence = []
}: {
  items?: SdkSandboxInfo[];
  infoSequence?: Array<SdkSandboxInfo | Error>;
} = {}) => {
  const listSandboxInfos = vi.fn(async () => ({ items }));
  const fallbackInfo = infoSequence.at(-1) ?? items[0] ?? NOT_FOUND_ERROR;
  const getSandboxInfo = vi.fn(async () => {
    if (fallbackInfo instanceof Error) throw fallbackInfo;
    return fallbackInfo;
  });
  for (const value of infoSequence) {
    getSandboxInfo.mockImplementationOnce(async () => {
      if (value instanceof Error) throw value;
      return value;
    });
  }
  const pauseSandbox = vi.fn(async () => undefined);
  const resumeSandbox = vi.fn(async () => undefined);
  const killSandbox = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const manager = {
    listSandboxInfos,
    getSandboxInfo,
    pauseSandbox,
    resumeSandbox,
    killSandbox,
    close
  } as unknown as SandboxManager;
  vi.spyOn(SandboxManager, 'create').mockReturnValue(manager);

  return {
    listSandboxInfos,
    getSandboxInfo,
    pauseSandbox,
    resumeSandbox,
    killSandbox,
    close
  };
};

describe('OpenSandboxAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configuration', () => {
    it('maps connection, runtime, and root path configuration', () => {
      const adapter = makeAdapter({
        connection: {
          apiKey: 'api-key',
          requestTimeoutSeconds: 60,
          useServerProxy: true,
          debug: true,
          runtime: 'kubernetes'
        },
        createConfig: {
          image: { repository: 'node', tag: '20' },
          volumes: [{ name: 'workspace', mountPath: '/data/' }]
        }
      });
      const connection = (
        adapter as unknown as {
          _connection: {
            requestTimeoutSeconds: number;
            useServerProxy: boolean;
            debug: boolean;
          };
        }
      )._connection;

      expect(adapter.provider).toBe('opensandbox');
      expect(adapter.runtime).toBe('kubernetes');
      expect(adapter.rootPath).toBe('/data');
      expect(connection).toMatchObject({
        requestTimeoutSeconds: 60,
        useServerProxy: true,
        debug: true
      });
    });

    it('uses default runtime, root path, and request timeout', () => {
      const adapter = makeAdapter();
      const connection = (adapter as unknown as { _connection: { requestTimeoutSeconds: number } })
        ._connection;

      expect(adapter.runtime).toBe('docker');
      expect(adapter.rootPath).toBe('/workspace');
      expect(connection.requestTimeoutSeconds).toBe(120);
    });
  });

  describe('create and connect', () => {
    it('creates through the SDK with provider-native metadata and readiness options', async () => {
      const adapter = makeAdapter({
        connection: { sessionId: 'session-1' },
        createConfig: {
          image: { repository: 'node', tag: '20' },
          metadata: { teamId: 'team-1', retry: '2' },
          resourceLimits: { cpuCount: 2, memoryMiB: 512, diskGiB: 10 },
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: 'localhost' }]
          },
          extensions: { traceId: 'trace-1' }
        }
      });
      const created = createSandboxMock();
      const create = vi.spyOn(Sandbox, 'create').mockResolvedValue(created.sandbox);

      await adapter.create();

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          image: 'node:20',
          metadata: { teamId: 'team-1', retry: '2', sessionId: 'session-1' },
          resource: { cpu: '2', memory: '512Mi', disk: '10Gi' },
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: 'localhost' }]
          },
          extensions: { traceId: 'trace-1' }
        })
      );
      expect(create.mock.calls[0]?.[0]).not.toHaveProperty('healthCheck');
      expect(adapter.id).toBe('sandbox-1');
      expect(adapter.status.state).toBe('Running');
    });

    it('requires an image when creating an OpenSandbox resource', async () => {
      const adapter = makeAdapter({ createConfig: {} });

      await expect(adapter.create()).rejects.toThrow(
        'createConfig.image is required for opensandbox provider'
      );
    });

    it('closes the previous independent SDK client when connecting to another id', async () => {
      const adapter = makeAdapter();
      const previous = createSandboxMock({ id: 'sandbox-old' });
      const next = createSandboxMock({ id: 'sandbox-new' });
      bindSandbox(adapter, previous.sandbox);
      vi.spyOn(Sandbox, 'connect').mockResolvedValue(next.sandbox);

      await adapter.connect('sandbox-new');

      expect(previous.close).toHaveBeenCalledTimes(1);
      expect(adapter.id).toBe('sandbox-new');
    });
  });

  describe('reuse and ensureRunning', () => {
    it('reuses the bound Running SDK client without manager lookup or reconnect', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock({
        infoSequence: [makeSdkInfo({ state: 'Running' })]
      });
      bindSandbox(adapter, bound.sandbox);
      const managerCreate = vi.spyOn(SandboxManager, 'create');
      const connect = vi.spyOn(Sandbox, 'connect');

      await adapter.ensureRunning();

      expect(bound.getInfo).toHaveBeenCalledTimes(1);
      expect(managerCreate).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(adapter.status.state).toBe('Running');
    });

    it('finds an unbound Running resource by session metadata and connects once', async () => {
      const adapter = makeAdapter({ connection: { sessionId: 'session-1' } });
      const info = makeSdkInfo({ overrides: { metadata: { sessionId: 'session-1' } } });
      const manager = mockManager({ items: [info] });
      const connected = createSandboxMock();
      const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValue(connected.sandbox);

      await adapter.ensureRunning();

      expect(manager.listSandboxInfos).toHaveBeenCalledWith({
        metadata: { sessionId: 'session-1' },
        pageSize: 100
      });
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('resumes an unbound Paused resource instead of creating a replacement', async () => {
      const adapter = makeAdapter();
      mockManager({ items: [makeSdkInfo({ state: 'Paused' })] });
      const resumed = createSandboxMock();
      const resume = vi.spyOn(Sandbox, 'resume').mockResolvedValue(resumed.sandbox);
      const create = vi.spyOn(Sandbox, 'create');

      await adapter.ensureRunning();

      expect(resume).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
      expect(create).not.toHaveBeenCalled();
      expect(adapter.id).toBe('sandbox-1');
    });

    it('waits for Pausing to become Paused before resuming the same bound resource', async () => {
      const adapter = makeAdapter();
      const resumed = createSandboxMock();
      const bound = createSandboxMock({
        infoSequence: [makeSdkInfo({ state: 'Pausing' }), makeSdkInfo({ state: 'Paused' })]
      });
      bindSandbox(adapter, bound.sandbox);
      const resume = vi.spyOn(Sandbox, 'resume').mockResolvedValue(resumed.sandbox);
      vi.spyOn(
        adapter as unknown as { sleep(ms: number): Promise<void> },
        'sleep'
      ).mockResolvedValue(undefined);

      await adapter.ensureRunning();

      expect(resume).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
      expect(bound.close).toHaveBeenCalledTimes(1);
      expect(adapter.id).toBe('sandbox-1');
      expect(adapter.status.state).toBe('Running');
    });

    it('does not create a missing resource when creation is disabled', async () => {
      const adapter = makeAdapter();
      mockManager();
      const create = vi.spyOn(Sandbox, 'create');

      await expect(adapter.ensureRunning({ allowCreate: false })).rejects.toBeInstanceOf(
        SandboxNotFoundError
      );
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('pauses an unbound resource, waits for Paused, and never kills it', async () => {
      const adapter = makeAdapter({ connection: { sessionId: 'session-1' } });
      const manager = mockManager({
        items: [makeSdkInfo({ state: 'Running' })],
        infoSequence: [makeSdkInfo({ state: 'Pausing' }), makeSdkInfo({ state: 'Paused' })]
      });
      vi.spyOn(
        adapter as unknown as { sleep(ms: number): Promise<void> },
        'sleep'
      ).mockResolvedValue(undefined);

      await adapter.stop();

      expect(manager.pauseSandbox).toHaveBeenCalledWith('sandbox-1');
      expect(manager.killSandbox).not.toHaveBeenCalled();
      expect(adapter.status.state).toBe('Stopped');
    });

    it('pauses a bound resource and replaces its client when resuming the same id', async () => {
      const adapter = makeAdapter();
      const resumed = createSandboxMock();
      const bound = createSandboxMock({
        infoSequence: [
          makeSdkInfo({ state: 'Running' }),
          makeSdkInfo({ state: 'Pausing' }),
          makeSdkInfo({ state: 'Paused' }),
          makeSdkInfo({ state: 'Paused' })
        ]
      });
      bindSandbox(adapter, bound.sandbox);
      const resume = vi.spyOn(Sandbox, 'resume').mockResolvedValue(resumed.sandbox);
      vi.spyOn(
        adapter as unknown as { sleep(ms: number): Promise<void> },
        'sleep'
      ).mockResolvedValue(undefined);

      await adapter.stop();
      await adapter.start();

      expect(bound.pause).toHaveBeenCalledTimes(1);
      expect(resume).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
      expect(bound.close).toHaveBeenCalledTimes(1);
      expect(adapter.id).toBe('sandbox-1');
      expect(adapter.status.state).toBe('Running');
    });

    it('does not issue another pause while the resource is already Pausing', async () => {
      const adapter = makeAdapter();
      const manager = mockManager({
        items: [makeSdkInfo({ state: 'Pausing' })],
        infoSequence: [makeSdkInfo({ state: 'Paused' })]
      });

      await adapter.stop();

      expect(manager.pauseSandbox).not.toHaveBeenCalled();
      expect(adapter.status.state).toBe('Stopped');
    });

    it('maps unsupported pause to FeatureNotSupportedError', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock({
        infoSequence: [makeSdkInfo({ state: 'Running' })]
      });
      bound.pause.mockRejectedValue(
        new SandboxException({
          error: new SandboxError('SANDBOX::API_NOT_SUPPORTED', 'Pause is not supported')
        })
      );
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.stop()).rejects.toBeInstanceOf(FeatureNotSupportedError);
    });

    it('treats a missing remote resource as an idempotent stop', async () => {
      const adapter = makeAdapter();
      const manager = mockManager();

      await expect(adapter.stop()).resolves.toBeUndefined();

      expect(manager.pauseSandbox).not.toHaveBeenCalled();
      expect(adapter.status.state).toBe('Stopped');
    });
  });

  describe('delete and close', () => {
    it('kills a bound resource through the SDK instance and releases its client', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock({ infoSequence: [NOT_FOUND_ERROR] });
      bindSandbox(adapter, bound.sandbox);

      await adapter.delete();

      expect(bound.kill).toHaveBeenCalledTimes(1);
      expect(bound.close).toHaveBeenCalledTimes(1);
      expect(adapter.id).toBeUndefined();
      expect(adapter.status.state).toBe('UnExist');
    });

    it('kills an explicit unbound id with one manager and waits for deletion', async () => {
      const adapter = makeAdapter();
      const manager = mockManager({
        infoSequence: [makeSdkInfo(), NOT_FOUND_ERROR]
      });

      await adapter.delete('sandbox-1');

      expect(manager.killSandbox).toHaveBeenCalledWith('sandbox-1');
      expect(manager.close).toHaveBeenCalledTimes(1);
      expect(adapter.status.state).toBe('UnExist');
    });

    it('does not clear a different bound sandbox when deleting an explicit id', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock({ id: 'sandbox-bound' });
      bindSandbox(adapter, bound.sandbox);
      const manager = mockManager({
        infoSequence: [makeSdkInfo({ id: 'sandbox-other' }), NOT_FOUND_ERROR]
      });

      await adapter.delete('sandbox-other');

      expect(manager.killSandbox).toHaveBeenCalledWith('sandbox-other');
      expect(adapter.id).toBe('sandbox-bound');
      expect(bound.close).not.toHaveBeenCalled();
      expect(adapter.status.state).not.toBe('UnExist');
    });

    it('closes idempotently without changing remote lifecycle', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bindSandbox(adapter, bound.sandbox);

      await adapter.close();
      await adapter.close();

      expect(bound.close).toHaveBeenCalledTimes(1);
      expect(bound.pause).not.toHaveBeenCalled();
      expect(bound.kill).not.toHaveBeenCalled();
      expect(adapter.id).toBeUndefined();
    });
  });

  describe('lifecycle info', () => {
    it('reads Paused info through SandboxManager without connecting execd', async () => {
      const adapter = makeAdapter();
      mockManager({ items: [makeSdkInfo({ state: 'Paused' })] });
      const connect = vi.spyOn(Sandbox, 'connect');

      await expect(adapter.getInfo()).resolves.toMatchObject({
        id: 'sandbox-1',
        status: { state: 'Stopped' }
      });
      expect(connect).not.toHaveBeenCalled();
    });

    it('maps transitional SDK states', async () => {
      const adapter = makeAdapter();
      mockManager({ items: [makeSdkInfo({ state: 'Resuming' })] });

      await expect(adapter.getInfo()).resolves.toMatchObject({ status: { state: 'Starting' } });
    });

    it('returns null for a missing session', async () => {
      const adapter = makeAdapter();
      mockManager();

      await expect(adapter.getInfo()).resolves.toBeNull();
    });
  });

  describe('endpoint and command execution', () => {
    it('parses an absolute SDK endpoint without duplicating the protocol', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.getEndpointUrl.mockResolvedValue('http://127.0.0.1:18080/proxy/abc');
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.getEndpoint(1318)).resolves.toMatchObject({
        host: '127.0.0.1',
        port: 18080,
        protocol: 'http',
        url: 'http://127.0.0.1:18080/proxy/abc'
      });
    });

    it('uses SDK exitCode, command timeout, and skipAccumulation', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      const controller = new AbortController();
      bound.commandRun.mockImplementation(async (_command, _options, handlers) => {
        handlers?.onStdout?.({ text: 'ok\n', timestamp: Date.now() });
        return {
          logs: { stdout: [], stderr: [] },
          result: [],
          exitCode: 7
        };
      });
      bindSandbox(adapter, bound.sandbox);

      await expect(
        adapter.execute('exit 7', {
          timeoutMs: 2_100,
          env: { NODE_ENV: 'test' },
          signal: controller.signal
        })
      ).resolves.toMatchObject({ stdout: 'ok\n', exitCode: 7 });
      expect(bound.commandRun).toHaveBeenCalledWith(
        'exit 7',
        expect.objectContaining({ timeoutSeconds: 3, envs: { NODE_ENV: 'test' } }),
        expect.objectContaining({ skipAccumulation: true }),
        controller.signal
      );
    });

    it('streams bounded output and emits one completion result', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.commandRun.mockImplementation(async (_command, _options, handlers) => {
        await handlers?.onStdout?.({ text: 'streamed', timestamp: Date.now() });
        return {
          logs: { stdout: [], stderr: [] },
          result: [],
          exitCode: 0
        };
      });
      bindSandbox(adapter, bound.sandbox);
      const onComplete = vi.fn();

      await adapter.executeStream('echo streamed', { onComplete });

      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ stdout: 'streamed', exitCode: 0 })
      );
      expect(bound.commandRun).toHaveBeenCalledWith(
        'echo streamed',
        expect.any(Object),
        expect.objectContaining({ skipAccumulation: true }),
        undefined
      );
    });

    it('throws SandboxStateError when executing before a client is bound', async () => {
      await expect(makeAdapter().execute('true')).rejects.toBeInstanceOf(SandboxStateError);
    });
  });

  describe('health and files', () => {
    it('delegates health checks to the SDK', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.isHealthy.mockResolvedValue(false);
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.ping()).resolves.toBe(false);
      expect(bound.isHealthy).toHaveBeenCalledTimes(1);
      expect(bound.commandRun).not.toHaveBeenCalled();
    });

    it('uses native buffered and streaming downloads', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.readBytes.mockResolvedValue(new TextEncoder().encode('buffered'));
      bound.readBytesStream.mockImplementation(async function* () {
        yield new TextEncoder().encode('native');
      });
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.readFiles(['file.txt'], { range: '1-3' })).resolves.toMatchObject([
        { path: '/workspace/file.txt', error: null }
      ]);
      const chunks: Uint8Array[] = [];
      for await (const chunk of adapter.readFileStream('file.txt')) chunks.push(chunk);

      expect(bound.readBytes).toHaveBeenCalledWith('/workspace/file.txt', {
        range: 'bytes=1-3'
      });
      expect(new TextDecoder().decode(chunks[0])).toBe('native');
      expect(bound.readBytesStream).toHaveBeenCalledWith('/workspace/file.txt');
      expect(bound.commandRun).not.toHaveBeenCalled();
    });

    it('passes binary data to the native SDK filesystem', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bindSandbox(adapter, bound.sandbox);
      const pooled = new ArrayBuffer(8);
      const data = new Uint8Array(pooled, 2, 3);
      data.set([1, 2, 3]);

      await expect(adapter.writeFiles([{ path: 'file.bin', data }])).resolves.toEqual([
        { path: '/workspace/file.bin', bytesWritten: 3, error: null }
      ]);
      const written = bound.writeFiles.mock.calls[0]?.[0]?.[0]?.data;
      expect(written).toBe(data);
    });

    it('uses the SDK streaming upload path directly', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bindSandbox(adapter, bound.sandbox);
      const stream = new ReadableStream<Uint8Array>();

      await adapter.writeFileStream('large.bin', stream);

      expect(bound.writeFiles).toHaveBeenCalledWith([
        { path: '/workspace/large.bin', data: stream }
      ]);
      expect(bound.commandRun).not.toHaveBeenCalled();
    });

    it('maps SDK directory entries for app callers', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.listDirectory.mockResolvedValue([
        { path: '/workspace/src', type: 'directory' },
        { path: '/workspace/index.ts', type: 'file', size: 12 }
      ]);
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.listDirectory('.')).resolves.toEqual([
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          isFile: false,
          size: undefined,
          modifiedAt: undefined
        },
        {
          name: 'index.ts',
          path: '/workspace/index.ts',
          isDirectory: false,
          isFile: true,
          size: 12,
          modifiedAt: undefined
        }
      ]);
      expect(bound.listDirectory).toHaveBeenCalledWith({ path: '/workspace' });
    });

    it('wraps command failures with adapter context', async () => {
      const adapter = makeAdapter();
      const bound = createSandboxMock();
      bound.commandRun.mockRejectedValue(new Error('execd unavailable'));
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.execute('false')).rejects.toBeInstanceOf(CommandExecutionError);
    });
  });
});
