import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sandbox,
  SandboxManager,
  type SandboxInfo as SdkSandboxInfo,
  type ServerStreamEvent,
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
  const commandInterrupt = vi.fn(async (_sessionId: string) => undefined);
  const commandRunStream = vi.fn((_command: string, _options?: unknown, _signal?: AbortSignal) =>
    createCommandStream([
      { type: 'init', text: 'execution-1', timestamp: Date.now() },
      { type: 'execution_complete', execution_time: 4, timestamp: Date.now() }
    ])
  );

  const sandbox = {
    id,
    getInfo,
    close: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    commands: {
      runStream: commandRunStream,
      interrupt: commandInterrupt
    },
    files: {
      readBytes,
      readBytesStream,
      writeFiles,
      getFileInfo
    }
  } as unknown as Sandbox;

  return {
    sandbox,
    getInfo,
    readBytes,
    readBytesStream,
    writeFiles,
    getFileInfo,
    commandInterrupt,
    commandRunStream
  };
};

const createCommandStream = async function* (events: ServerStreamEvent[]) {
  for (const event of events) yield event;
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
      resourceLimits: { cpuCount: 2, memoryMiB: 512, storageSize: '5G' }
    });

    await adapter.create();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'node:20',
        metadata: { teamId: 'team-1', sessionId: 'session-1' },
        resource: { cpu: '2', memory: '512Mi', disk: '5G' }
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

  it('stops consuming and aborts the provider stream immediately after execution_complete', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    let consumedAfterTerminal = false;
    let providerSignal: AbortSignal | undefined;
    bound.commandRunStream.mockImplementation((_command, _options, signal) =>
      (async function* () {
        providerSignal = signal;
        yield { type: 'init', text: 'execution-1', timestamp: Date.now() };
        yield { type: 'stdout', text: 'hello', timestamp: Date.now() };
        yield { type: 'execution_complete', execution_time: 2, timestamp: Date.now() };
        consumedAfterTerminal = true;
        yield { type: 'stdout', text: 'late output', timestamp: Date.now() };
      })()
    );
    bindSandbox(adapter, bound.sandbox);
    const chunks: string[] = [];
    const onComplete = vi.fn();

    await adapter.executeStream('echo hello', {
      onStdout: (message) => chunks.push(message.text),
      onComplete
    });

    expect(chunks).toEqual(['hello']);
    expect(onComplete).toHaveBeenCalledWith({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
      durationMs: 2,
      truncated: false
    });
    expect(consumedAfterTerminal).toBe(false);
    expect(providerSignal?.aborted).toBe(true);
  });

  it('maps a provider error terminal event to a non-zero command result', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRunStream.mockReturnValue(
      createCommandStream([
        { type: 'init', text: 'execution-1', timestamp: Date.now() },
        {
          type: 'error',
          error: { ename: 'ProcessExitError', evalue: '7', traceback: [] },
          timestamp: Date.now()
        }
      ])
    );
    bindSandbox(adapter, bound.sandbox);

    await expect(adapter.execute('exit 7')).resolves.toMatchObject({ exitCode: 7 });
  });

  it('returns a background session as soon as its terminal event arrives', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRunStream.mockReturnValue(
      createCommandStream([
        { type: 'init', text: 'background-1', timestamp: Date.now() },
        { type: 'execution_complete', execution_time: 3, timestamp: Date.now() }
      ])
    );
    bindSandbox(adapter, bound.sandbox);

    const execution = await adapter.executeBackground('sleep 30');
    await execution.kill();

    expect(execution.sessionId).toBe('background-1');
    expect(bound.commandRunStream).toHaveBeenCalledWith(
      'sleep 30',
      expect.objectContaining({ background: true }),
      expect.any(AbortSignal)
    );
    expect(bound.commandInterrupt).toHaveBeenCalledWith('background-1');
  });

  it('rejects a command stream that reaches EOF without a terminal event', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRunStream.mockReturnValue(
      createCommandStream([{ type: 'init', text: 'execution-1', timestamp: Date.now() }])
    );
    bindSandbox(adapter, bound.sandbox);

    await expect(adapter.execute('true')).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: 'OpenSandbox command stream ended without a terminal event'
      })
    });
  });

  it('preserves iterator failures as the command execution cause', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRunStream.mockReturnValue(
      (async function* () {
        yield { type: 'init', text: 'execution-1', timestamp: Date.now() } as ServerStreamEvent;
        throw new Error('provider iterator failed');
      })()
    );
    bindSandbox(adapter, bound.sandbox);

    await expect(adapter.execute('true')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'provider iterator failed' })
    });
  });

  it('propagates caller cancellation while consuming the command stream', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.commandRunStream.mockImplementation((_command, _options, signal) =>
      (async function* () {
        yield { type: 'init', text: 'execution-1', timestamp: Date.now() };
        if (signal?.aborted) throw signal.reason ?? new Error('provider stream aborted');
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('provider stream aborted')),
            { once: true }
          );
        });
      })()
    );
    bindSandbox(adapter, bound.sandbox);
    const controller = new AbortController();

    const execution = adapter.execute('sleep 30', { signal: controller.signal });
    await vi.waitFor(() => expect(bound.commandRunStream).toHaveBeenCalledOnce());
    controller.abort(new Error('caller cancelled while running'));

    await expect(execution).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'caller cancelled while running' })
    });
  });

  it('fails provider operations before a client is bound', async () => {
    await expect(new OpenSandboxAdapter(CONNECTION).execute('true')).rejects.toBeInstanceOf(
      SandboxStateError
    );
  });
});
