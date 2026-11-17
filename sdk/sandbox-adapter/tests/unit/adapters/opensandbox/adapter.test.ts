import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sandbox,
  SandboxApiException,
  SandboxManager,
  type SandboxInfo as SdkSandboxInfo,
  type ServerStreamEvent,
  type WriteEntry
} from '@alibaba-group/opensandbox';
import { createExecdClient, FilesystemAdapter } from '@alibaba-group/opensandbox/internal';
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

const notFoundError = () =>
  new SandboxApiException({
    message: 'Sandbox not found',
    statusCode: 404
  });

const createSdkSandbox = (
  props: {
    id?: string;
    info?: Array<SdkSandboxInfo | Error>;
    files?: Map<string, string>;
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
  const files = props.files ?? new Map<string, string>();
  const replaceContentsDetailed = vi.fn(
    async (entries: Parameters<Sandbox['files']['replaceContentsDetailed']>[0]) => {
      // 模拟 SDK 的路径键请求体：同一请求中重复路径只保留最后一条编辑。
      const editsByPath = new Map(entries.map((entry) => [entry.path, entry]));
      return [...editsByPath.values()]
        .map(({ path, oldContent, newContent }) => {
          const parts = (files.get(path) ?? '').split(oldContent);
          const replacedCount = parts.length - 1;
          if (replacedCount > 0) files.set(path, parts.join(newContent));
          return { path, replacedCount };
        })
        .reverse();
    }
  );
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
      replaceContentsDetailed,
      getFileInfo
    }
  } as unknown as Sandbox;

  return {
    sandbox,
    getInfo,
    readBytes,
    readBytesStream,
    writeFiles,
    replaceContentsDetailed,
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

const mockManager = (
  items: SdkSandboxInfo[] = [],
  info: SdkSandboxInfo | Array<SdkSandboxInfo | Error> = sdkInfo('Deleted')
) => {
  const sequence = Array.isArray(info) ? info : [info];
  const getSandboxInfo = vi.fn<() => Promise<SdkSandboxInfo>>();
  for (const value of sequence) {
    getSandboxInfo.mockImplementationOnce(async () => {
      if (value instanceof Error) throw value;
      return value;
    });
  }
  const fallback = sequence.at(-1) ?? sdkInfo('Deleted');
  getSandboxInfo.mockImplementation(async () => {
    if (fallback instanceof Error) throw fallback;
    return fallback;
  });
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

  it.each(['Allocated', 'Pending'])(
    'waits for provider state %s to reach Running instead of failing',
    async (state) => {
      vi.useFakeTimers();
      try {
        const adapter = new OpenSandboxAdapter(CONNECTION);
        const bound = createSdkSandbox({
          info: [sdkInfo(state), sdkInfo(state), sdkInfo('Running')]
        });
        bindSandbox(adapter, bound.sandbox);

        const ensureRunning = adapter.ensureRunning();
        await vi.advanceTimersByTimeAsync(2_000);
        await ensureRunning;

        expect(adapter.status.state).toBe('Running');
        expect(bound.getInfo).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('waits for an allocated session resource discovered by metadata before connecting', async () => {
    vi.useFakeTimers();
    try {
      // 直接指定轮询序列，避免 helper 默认排队的 Deleted 响应先于 Allocated 生效。
      mockManager([sdkInfo('Allocated')], [sdkInfo('Allocated'), sdkInfo('Running')]);
      const bound = createSdkSandbox();
      const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValue(bound.sandbox);
      const adapter = new OpenSandboxAdapter(CONNECTION);

      const ensureRunning = adapter.ensureRunning();
      await vi.advanceTimersByTimeAsync(1_000);
      await ensureRunning;

      expect(connect).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
      expect(adapter.status.state).toBe('Running');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['Failed', 'Unknown', 'Terminated'])(
    'keeps terminal provider state %s fatal',
    async (state) => {
      const adapter = new OpenSandboxAdapter(CONNECTION);
      const bound = createSdkSandbox({ info: [sdkInfo(state)] });
      bindSandbox(adapter, bound.sandbox);

      await expect(adapter.ensureRunning()).rejects.toThrow('Sandbox error');
    }
  );

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

  it.each(['Paused', 'Pausing', 'Creating', 'Deleting', 'Stopping'])(
    'connect-only rejects %s without resuming or creating',
    async (state) => {
      mockManager([sdkInfo(state)]);
      const resume = vi.spyOn(Sandbox, 'resume');
      const create = vi.spyOn(Sandbox, 'create');
      const connect = vi.spyOn(Sandbox, 'connect');
      const adapter = new OpenSandboxAdapter(CONNECTION);
      await expect(adapter.connectRunning()).rejects.toBeInstanceOf(SandboxStateError);
      expect(resume).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    }
  );
  it('connect-only binds an existing running sandbox', async () => {
    mockManager([sdkInfo()]);
    const bound = createSdkSandbox();
    vi.spyOn(Sandbox, 'connect').mockResolvedValue(bound.sandbox);
    const adapter = new OpenSandboxAdapter(CONNECTION);
    await adapter.connectRunning();
    await adapter.connectRunning();
    expect(adapter.id).toBe('sandbox-1');
    expect(Sandbox.connect).toHaveBeenCalledTimes(1);
  });
  it('connect-only reports a missing session without creating', async () => {
    mockManager();
    const create = vi.spyOn(Sandbox, 'create');
    await expect(new OpenSandboxAdapter(CONNECTION).connectRunning()).rejects.toBeInstanceOf(
      SandboxNotFoundError
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('deletes every visible physical resource for a stable session', async () => {
    const { killSandbox } = mockManager([
      sdkInfo('Running', 'first'),
      sdkInfo('Running', 'second')
    ]);
    await new OpenSandboxAdapter(CONNECTION).delete();
    expect(killSandbox.mock.calls).toEqual([['first'], ['second']]);
  });

  it('deletes a bound sandbox on stop across Stopping cleanup until 404 and releases its client', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new OpenSandboxAdapter(CONNECTION);
      const bound = createSdkSandbox({ info: [sdkInfo('Stopping'), notFoundError()] });
      bindSandbox(adapter, bound.sandbox);

      const stopPromise = adapter.stop();
      await vi.advanceTimersByTimeAsync(1_000);
      await stopPromise;

      expect(bound.sandbox.kill).toHaveBeenCalledTimes(1);
      expect(bound.getInfo).toHaveBeenCalledTimes(2);
      expect(bound.sandbox.close).toHaveBeenCalledTimes(1);
      expect(adapter.status.state).toBe('UnExist');
      expect(adapter.id).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deletes an unbound sandbox found by session metadata on stop across Stopping cleanup until 404', async () => {
    vi.useFakeTimers();
    try {
      const manager = mockManager([sdkInfo('Running')], [sdkInfo('Stopping'), notFoundError()]);
      const adapter = new OpenSandboxAdapter(CONNECTION);

      const stopPromise = adapter.stop();
      await vi.advanceTimersByTimeAsync(1_000);
      await stopPromise;

      expect(manager.killSandbox).toHaveBeenCalledWith('sandbox-1');
      expect(manager.getSandboxInfo).toHaveBeenCalledTimes(2);
      expect(manager.getSandboxInfo).toHaveBeenCalledWith('sandbox-1');
      expect(adapter.status.state).toBe('UnExist');
    } finally {
      vi.useRealTimers();
    }
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

  it('uses native file and streaming reads', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(adapter, bound.sandbox);

    await adapter.readFiles(['file.txt']);
    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.readFileStream('file.txt')) chunks.push(chunk);

    expect(bound.readBytes).toHaveBeenCalledWith('/workspace/file.txt');
    expect(bound.readBytesStream).toHaveBeenCalledWith('/workspace/file.txt');
    expect(new TextDecoder().decode(chunks[0])).toBe('stream');
    expect(bound.readBytes).toHaveBeenCalledTimes(1);
  });

  it.each([
    { oldContent: 'use(x)', replacedCount: 1, expectedUse: 'use(y)' },
    { oldContent: 'missing', replacedCount: 0, expectedUse: 'use(x)' }
  ])(
    'keeps per-entry counts when a later edit replaces $replacedCount occurrences',
    async ({ oldContent, replacedCount, expectedUse }) => {
      const adapter = new OpenSandboxAdapter(CONNECTION);
      const files = new Map([
        ['/workspace/app.py', 'import x\nuse(x)\nimport x\n'],
        ['/workspace/util.py', 'a = 1\n']
      ]);
      const bound = createSdkSandbox({ files });
      bindSandbox(adapter, bound.sandbox);

      await expect(
        adapter.replaceContent([
          { path: 'app.py', oldContent: 'import x', newContent: 'import y' },
          { path: '/workspace/app.py', oldContent, newContent: 'use(y)' },
          { path: 'util.py', oldContent: 'a = 1', newContent: 'a = 2' }
        ])
      ).resolves.toEqual([
        { path: '/workspace/app.py', status: 'replaced', replacedCount: 2 },
        {
          path: '/workspace/app.py',
          ...(replacedCount === 0 ? { status: 'unmatched' } : { status: 'replaced', replacedCount })
        },
        { path: '/workspace/util.py', status: 'replaced', replacedCount: 1 }
      ]);

      expect(files.get('/workspace/app.py')).toBe(`import y\n${expectedUse}\nimport y\n`);
      expect(files.get('/workspace/util.py')).toBe('a = 2\n');
      expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(2);
    }
  );

  it.each([false, true])(
    'keeps missing counts unknown after edits land (partial response: %s)',
    async (partial) => {
      const adapter = new OpenSandboxAdapter(CONNECTION);
      const files = new Map([
        ['/workspace/app.py', 'old'],
        ['/workspace/util.py', 'old']
      ]);
      const bound = createSdkSandbox({ files });
      const replace = bound.replaceContentsDetailed.getMockImplementation()!;
      bound.replaceContentsDetailed.mockImplementation(async (entries) => {
        const results = await replace(entries);
        return partial ? results.filter((result) => result.path === '/workspace/util.py') : [];
      });
      bindSandbox(adapter, bound.sandbox);

      await expect(
        adapter.replaceContent([
          { path: 'app.py', oldContent: 'old', newContent: 'new' },
          { path: 'util.py', oldContent: 'old', newContent: 'new' },
          { path: '/workspace/app.py', oldContent: 'new', newContent: 'final' }
        ])
      ).resolves.toEqual([
        { path: '/workspace/app.py', status: 'unknown' },
        {
          path: '/workspace/util.py',
          ...(partial ? { status: 'replaced', replacedCount: 1 } : { status: 'unknown' })
        },
        { path: '/workspace/app.py', status: 'unknown' }
      ]);

      expect(files.get('/workspace/app.py')).toBe('final');
      expect(files.get('/workspace/util.py')).toBe('new');
    }
  );

  it('returns no results and sends no request for no edits', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(adapter, bound.sandbox);

    await expect(adapter.replaceContent([])).resolves.toEqual([]);
    expect(bound.replaceContentsDetailed).not.toHaveBeenCalled();
  });

  it('reports unmatched edits even when another file in the batch was edited', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.replaceContentsDetailed.mockResolvedValue([
      { path: '/workspace/a.txt', replacedCount: 2 },
      { path: '/workspace/b.txt', replacedCount: 0 },
      { path: '/workspace/c.txt', replacedCount: 0 }
    ]);
    bindSandbox(adapter, bound.sandbox);

    const result = adapter.replaceContent([
      { path: 'a.txt', oldContent: 'old', newContent: 'new' },
      { path: 'b.txt', oldContent: 'missing', newContent: 'new' },
      { path: 'c.txt', oldContent: 'missing', newContent: 'new' }
    ]);

    await expect(result).resolves.toEqual([
      { path: '/workspace/a.txt', status: 'replaced', replacedCount: 2 },
      { path: '/workspace/b.txt', status: 'unmatched' },
      { path: '/workspace/c.txt', status: 'unmatched' }
    ]);
    expect(bound.replaceContentsDetailed).toHaveBeenCalledWith([
      { path: '/workspace/a.txt', oldContent: 'old', newContent: 'new' },
      { path: '/workspace/b.txt', oldContent: 'missing', newContent: 'new' },
      { path: '/workspace/c.txt', oldContent: 'missing', newContent: 'new' }
    ]);
  });

  it('reports a zero-match response from a verbose request through the real SDK', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    const requests: Request[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      // 与 execd 一致：没有 verbose 时，HTTP 200 不携带替换次数。
      return url.searchParams.get('verbose') === 'true'
        ? Response.json({ '/workspace/a.txt': { replacedCount: 0 } })
        : new Response(null, { status: 200 });
    };
    const options = { baseUrl: 'http://sandbox.test', fetch: mockFetch };
    Object.defineProperty(bound.sandbox, 'files', {
      value: new FilesystemAdapter(createExecdClient(options), options)
    });
    bindSandbox(adapter, bound.sandbox);

    await expect(
      adapter.replaceContent([{ path: 'a.txt', oldContent: 'missing', newContent: 'new' }])
    ).resolves.toEqual([{ path: '/workspace/a.txt', status: 'unmatched' }]);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    const url = new URL(request.url);
    expect(url.pathname).toBe('/files/replace');
    expect(url.searchParams.get('verbose')).toBe('true');
    const body: unknown = await request.json();
    expect(body).toStrictEqual({ '/workspace/a.txt': { old: 'missing', new: 'new' } });
  });

  it('stops later batches and reports skipped entries after an unmatched edit', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const files = new Map([['/workspace/a.txt', 'new']]);
    const bound = createSdkSandbox({ files });
    // 同批次 b 的计数缺失，只表示未知，不能和后续尚未执行的条目混淆。
    bound.replaceContentsDetailed.mockResolvedValue([
      { path: '/workspace/a.txt', replacedCount: 0 }
    ]);
    bindSandbox(adapter, bound.sandbox);

    const results = await adapter.replaceContent([
      { path: 'a.txt', oldContent: 'missing', newContent: 'new' },
      { path: 'b.txt', oldContent: 'old', newContent: 'new' },
      { path: '/workspace/a.txt', oldContent: 'new', newContent: 'later' },
      { path: 'a.txt', oldContent: 'later', newContent: 'final' }
    ]);

    expect(results.slice(0, 2)).toEqual([
      { path: '/workspace/a.txt', status: 'unmatched' },
      { path: '/workspace/b.txt', status: 'unknown' }
    ]);
    expect(results.slice(2)).toEqual([
      { path: '/workspace/a.txt', status: 'skipped' },
      { path: '/workspace/a.txt', status: 'skipped' }
    ]);
    expect(files.get('/workspace/a.txt')).toBe('new');
    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(1);
  });

  it('accepts empty replacement details from servers without verbose support', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    bound.replaceContentsDetailed.mockResolvedValue([]);
    bindSandbox(adapter, bound.sandbox);

    await expect(
      adapter.replaceContent([
        { path: 'a.txt', oldContent: 'old', newContent: 'new' },
        { path: '/workspace/a.txt', oldContent: 'new', newContent: 'later' }
      ])
    ).resolves.toEqual([
      { path: '/workspace/a.txt', status: 'unknown' },
      { path: '/workspace/a.txt', status: 'unknown' }
    ]);

    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(2);
  });

  it('propagates replacement request failures without sending later batches', async () => {
    const adapter = new OpenSandboxAdapter(CONNECTION);
    const bound = createSdkSandbox();
    const error = new Error('Replace contents failed');
    bound.replaceContentsDetailed.mockRejectedValue(error);
    bindSandbox(adapter, bound.sandbox);

    await expect(
      adapter.replaceContent([
        { path: 'a.txt', oldContent: 'old', newContent: 'new' },
        { path: '/workspace/a.txt', oldContent: 'new', newContent: 'later' }
      ])
    ).rejects.toBe(error);

    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(1);
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
      onStdout: (message) => {
        chunks.push(message.text);
      },
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
