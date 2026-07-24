import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sandbox,
  SandboxManager,
  type ExecutionHandlers,
  type SandboxInfo as SdkSandboxInfo,
  type WriteEntry
} from '@alibaba-group/opensandbox';
import { OpenSandboxAdapter, type OpenSandboxConnectionConfig } from '@/adapters/opensandbox';
import { SandboxNotFoundError, SandboxStateError } from '@/errors';

const CONNECTION: OpenSandboxConnectionConfig = {
  sessionId: 'session-1',
  baseUrl: 'http://localhost'
};

const sdkInfo = (state = 'Running', id = 'sandbox-1'): SdkSandboxInfo =>
  ({
    id,
    image: { uri: 'node:20' },
    entrypoint: [],
    metadata: { sessionId: CONNECTION.sessionId },
    status: { state },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null
  }) as SdkSandboxInfo;

const createSdkSandbox = (
  props: {
    id?: string;
    info?: Array<SdkSandboxInfo | Error>;
  } = {}
) => {
  const id = props.id ?? 'sandbox-1';
  const info = props.info ?? [sdkInfo('Running', id)];
  const getInfo = vi.fn<() => Promise<SdkSandboxInfo>>();
  for (const value of info) {
    getInfo.mockImplementationOnce(async () => {
      if (value instanceof Error) throw value;
      return value;
    });
  }
  const fallback = info.at(-1) ?? sdkInfo('Running', id);
  getInfo.mockImplementation(async () => {
    if (fallback instanceof Error) throw fallback;
    return fallback;
  });

  const readBytes = vi.fn(async () => new TextEncoder().encode('content'));
  const readBytesStream = vi.fn(async function* () {
    yield new TextEncoder().encode('stream');
  });
  const writeFiles = vi.fn(async (_entries: WriteEntry[]) => undefined);
  const getFileInfo = vi.fn(async () => ({}));
  const commandRun = vi.fn(
    async (
      _command: string,
      _options?: unknown,
      _handlers?: ExecutionHandlers,
      _signal?: AbortSignal
    ) => ({
      id: 'execution-1',
      exitCode: 0,
      complete: { executionTimeMs: 4 }
    })
  );

  const sandbox = {
    id,
    getInfo,
    close: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    commands: {
      run: commandRun
    },
    files: {
      readBytes,
      readBytesStream,
      writeFiles,
      getFileInfo
    }
  } as unknown as Sandbox;

  return { sandbox, getInfo, readBytes, readBytesStream, writeFiles, getFileInfo, commandRun };
};

const bindSandbox = (adapter: OpenSandboxAdapter, sandbox: Sandbox): void => {
  const target = adapter as unknown as {
    lifecycle: { boundSandbox?: Sandbox };
  };
  target.lifecycle.boundSandbox = sandbox;
};

const mockManager = (items: SdkSandboxInfo[] = [], info: SdkSandboxInfo = sdkInfo('Deleted')) => {
  const getSandboxInfo = vi.fn(async () => info);
  const killSandbox = vi.fn(async () => undefined);
  const manager = {
    listSandboxInfos: vi.fn(async () => ({ items })),
    getSandboxInfo,
    killSandbox,
    close: vi.fn(async () => undefined)
  } as unknown as SandboxManager;
  vi.spyOn(SandboxManager, 'create').mockReturnValue(manager);
  return { getSandboxInfo, killSandbox };
};

describe('OpenSandboxAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('derives the workspace from the first volume', () => {
    const adapter = new OpenSandboxAdapter(CONNECTION, {
      image: { repository: 'node', tag: '20' },
      volumes: [{ name: 'workspace', mountPath: '/data/' }]
    });

    expect(adapter.rootPath).toBe('/data');
  });

  it('creates with string metadata and the stable reuse session id', async () => {
    const created = createSdkSandbox();
    const create = vi.spyOn(Sandbox, 'create').mockResolvedValue(created.sandbox);
    const adapter = new OpenSandboxAdapter(CONNECTION, {
      image: { repository: 'node', tag: '20' },
      metadata: { teamId: 'team-1' },
      resourceLimits: { cpuCount: 2, memoryMiB: 512 }
    });

    await adapter.create();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'node:20',
        metadata: { teamId: 'team-1', sessionId: 'session-1' },
        resource: { cpu: '2', memory: '512Mi' }
      })
    );
    expect(adapter.id).toBe('sandbox-1');
  });

  it('requires an image only when create is requested', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    await expect(adapter.create()).rejects.toThrow('createConfig.image');
  });

  it('reuses an already bound running SDK client', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(adapter, bound.sandbox);
    const managerCreate = vi.spyOn(SandboxManager, 'create');
    const connect = vi.spyOn(Sandbox, 'connect');

    await adapter.ensureRunning();

    expect(bound.getInfo).toHaveBeenCalledTimes(1);
    expect(managerCreate).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('resumes the reusable paused resource found by session metadata', async () => {
    mockManager([sdkInfo('Paused')]);
    const resumed = createSdkSandbox();
    const resume = vi.spyOn(Sandbox, 'resume').mockResolvedValue(resumed.sandbox);
    const adapter = new OpenSandboxAdapter(CONNECTION);

    await adapter.ensureRunning();

    expect(resume).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
    expect(adapter.id).toBe('sandbox-1');
  });

  it('does not create a missing resource when reuse-only mode is requested', async () => {
    mockManager();
    const adapter = new OpenSandboxAdapter(CONNECTION);

    await expect(adapter.ensureRunning({ allowCreate: false })).rejects.toBeInstanceOf(
      SandboxNotFoundError
    );
  });

  it('deletes a bound sandbox on stop and releases its client', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox({ info: [sdkInfo('Deleted')] });
    bindSandbox(adapter, bound.sandbox);

    await adapter.stop();

    expect(bound.sandbox.kill).toHaveBeenCalledTimes(1);
    expect(bound.sandbox.close).toHaveBeenCalledTimes(1);
    expect(adapter.status.state).toBe('UnExist');
    expect(adapter.id).toBeUndefined();
  });

  it('deletes an unbound sandbox found by session metadata on stop', async () => {
    const manager = mockManager([sdkInfo('Running')], sdkInfo('Deleted'));
    const adapter = new OpenSandboxAdapter(CONNECTION);

    await adapter.stop();

    expect(manager.killSandbox).toHaveBeenCalledWith('sandbox-1');
    expect(manager.getSandboxInfo).toHaveBeenCalledWith('sandbox-1');
    expect(adapter.status.state).toBe('UnExist');
  });

  it('close releases the local client without changing the remote lifecycle', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(adapter, bound.sandbox);

    await adapter.close();
    await adapter.close();

    expect(bound.sandbox.close).toHaveBeenCalledTimes(1);
    expect(bound.sandbox.kill).not.toHaveBeenCalled();
  });

  it('uses native range and streaming reads while reporting invalid ranges per file', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(adapter, bound.sandbox);

    await adapter.readFiles(['file.txt'], { offset: 1, length: 3 });
    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.readFileStream('file.txt')) chunks.push(chunk);
    const [invalidResult] = await adapter.readFiles(['file.txt'], { length: -1 });

    expect(bound.readBytes).toHaveBeenCalledWith('/workspace/file.txt', {
      offset: 1,
      limit: 3
    });
    expect(bound.readBytesStream).toHaveBeenCalledWith('/workspace/file.txt');
    expect(new TextDecoder().decode(chunks[0])).toBe('stream');
    expect(invalidResult).toMatchObject({
      path: '/workspace/file.txt',
      error: expect.any(TypeError)
    });
    expect(bound.readBytes).toHaveBeenCalledTimes(1);
  });

  it('converts POSIX modes at the SDK boundary', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.getFileInfo.mockResolvedValue({
      '/workspace/file.txt': { path: '/workspace/file.txt', type: 'file', mode: 644 }
    });
    bindSandbox(adapter, bound.sandbox);

    await adapter.writeFiles([{ path: 'file.txt', data: 'x', mode: 0o644 }]);
    const info = await adapter.getFileInfo(['file.txt']);

    expect(bound.writeFiles).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/file.txt', mode: 644 })
    ]);
    expect(info.get('/workspace/file.txt')?.mode).toBe(0o644);
  });

  it('counts streamed upload bytes after the SDK consumes the stream', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.writeFiles.mockImplementation(async (entries) => {
      for await (const _chunk of entries[0]?.data as AsyncIterable<Uint8Array>) {
        // Consume the provider stream.
      }
    });
    bindSandbox(adapter, bound.sandbox);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      }
    });

    await expect(adapter.writeFiles([{ path: 'file.bin', data: stream }])).resolves.toEqual([
      { path: '/workspace/file.bin', bytesWritten: 3, error: null }
    ]);
  });

  it('streams command output without SDK accumulation', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRun.mockImplementation(
      async (_command, _options, handlers?: ExecutionHandlers) => {
        await handlers?.onStdout?.({ text: 'hello', timestamp: Date.now() });
        return { id: 'execution-1', exitCode: 0, complete: { executionTimeMs: 2 } };
      }
    );
    bindSandbox(adapter, bound.sandbox);
    const chunks: string[] = [];

    await adapter.executeStream('echo hello', {
      onStdout: (message) => {
        chunks.push(message.text);
      }
    });

    expect(chunks).toEqual(['hello']);
    expect(bound.commandRun.mock.calls[0]?.[2]).toMatchObject({ skipAccumulation: true });
  });

  it('fails provider operations before a client is bound', async () => {
    await expect(new OpenSandboxAdapter(CONNECTION).execute('true')).rejects.toBeInstanceOf(
      SandboxStateError
    );
  });
});
