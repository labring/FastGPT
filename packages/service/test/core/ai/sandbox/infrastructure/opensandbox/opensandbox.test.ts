import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Sandbox,
  SandboxApiException,
  SandboxManager,
  SandboxReadyTimeoutException,
  type ContentReplaceResult,
  type SandboxInfo as SdkSandboxInfo,
  type ServerStreamEvent,
  type WriteEntry
} from '@alibaba-group/opensandbox';
import { createExecdClient, FilesystemAdapter } from '@alibaba-group/opensandbox/internal';
import {
  listManagedOpenSandboxes,
  OpenSandboxClient,
  SandboxException,
  SandboxNotFoundError,
  SandboxStateError,
  type OpenSandboxConnectionConfig
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';

const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';
const CONNECTION: OpenSandboxConnectionConfig = {
  deploymentId: DEPLOYMENT_ID,
  sessionId: 'session-1',
  baseUrl: 'http://localhost'
};

const sdkInfo = (state = 'Running', id = 'sandbox-1'): SdkSandboxInfo =>
  ({
    id,
    image: { uri: 'node:20' },
    entrypoint: [],
    metadata: { app: 'fastgpt', deploymentId: DEPLOYMENT_ID, sessionId: CONNECTION.sessionId },
    status: { state },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null
  }) as SdkSandboxInfo;

const notFoundError = () =>
  new SandboxApiException({
    message: 'Sandbox not found',
    statusCode: 404
  });

const createCommandStream = async function* (events: ServerStreamEvent[]) {
  for (const event of events) yield event;
};

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
  const replaceContentsDetailed = vi.fn(
    async (
      entries: Array<{ path: string; oldContent: string; newContent: string }>
    ): Promise<ContentReplaceResult[]> => entries.map(({ path }) => ({ path, replacedCount: 1 }))
  );
  const deleteFiles = vi.fn(async (_paths: string[]) => undefined);
  const getFileInfo = vi.fn(async () => ({}));
  const commandRunStream = vi.fn((_command: string, _options?: unknown, _signal?: AbortSignal) =>
    createCommandStream([
      { type: 'init', text: 'execution-1', timestamp: Date.now() },
      { type: 'execution_complete', execution_time: 4, timestamp: Date.now() }
    ])
  );

  const sandbox = {
    id,
    getInfo,
    getEndpoint: vi.fn(async () => {
      throw new Error('endpoint unconfigured in stub');
    }),
    close: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    commands: {
      runStream: commandRunStream
    },
    files: {
      readBytes,
      readBytesStream,
      writeFiles,
      replaceContentsDetailed,
      deleteFiles,
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
    deleteFiles,
    getFileInfo,
    commandRunStream
  };
};

const bindSandbox = (client: OpenSandboxClient, sandbox: Sandbox): void => {
  (client as unknown as { boundSandbox?: Sandbox }).boundSandbox = sandbox;
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

describe('OpenSandboxClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('derives the workspace from the first volume', () => {
    const client = new OpenSandboxClient(CONNECTION, {
      image: 'node:20',
      volumes: [{ name: 'workspace', mountPath: '/data/' }]
    });

    expect(client.rootPath).toBe('/data');
  });

  it('creates with string metadata and the stable reuse session id', async () => {
    const created = createSdkSandbox();
    const create = vi.spyOn(Sandbox, 'create').mockResolvedValue(created.sandbox);
    const client = new OpenSandboxClient(CONNECTION, {
      image: 'node:20',
      metadata: { teamId: 'team-1' },
      resourceLimits: { cpuCount: 2, memoryMiB: 512 }
    });

    await client.create();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'node:20',
        metadata: {
          app: 'fastgpt',
          deploymentId: DEPLOYMENT_ID,
          teamId: 'team-1',
          sessionId: 'session-1'
        },
        resource: { cpu: '2', memory: '512Mi' }
      })
    );
    expect(client.id).toBe('sandbox-1');
  });

  it('lists only exact deployment owners across SDK pages', async () => {
    const deploymentId = '0123456789abcdef0123456789abcdef';
    const owned = { app: 'fastgpt', deploymentId, sessionId: 'session-1' };
    const listSandboxInfos = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { ...sdkInfo('Running', 'owned-running'), metadata: owned },
          { ...sdkInfo('Running', 'unowned'), metadata: undefined },
          { ...sdkInfo('Running', 'missing-deployment'), metadata: { app: 'fastgpt' } },
          {
            ...sdkInfo('Running', 'other-deployment'),
            metadata: { ...owned, deploymentId: 'f'.repeat(32) }
          }
        ],
        pagination: { hasNextPage: true }
      })
      .mockResolvedValueOnce({
        items: [
          { ...sdkInfo('Allocated', 'owned-allocated'), metadata: owned },
          { ...sdkInfo('Running', 'other-app'), metadata: { ...owned, app: 'other' } },
          { ...sdkInfo('Deleted', 'deleted'), metadata: owned },
          { ...sdkInfo('Deleting', 'deleting'), metadata: owned }
        ],
        pagination: { hasNextPage: false }
      });
    const close = vi.fn(async () => undefined);
    vi.spyOn(SandboxManager, 'create').mockReturnValue({
      listSandboxInfos,
      close
    } as unknown as SandboxManager);

    const items = await listManagedOpenSandboxes({ baseUrl: 'http://shared.local' }, deploymentId);

    expect(items.map(({ id }) => id)).toEqual(['owned-running', 'owned-allocated']);
    expect(listSandboxInfos).toHaveBeenNthCalledWith(1, {
      metadata: { app: 'fastgpt', deploymentId },
      page: 1,
      pageSize: 100
    });
    expect(listSandboxInfos).toHaveBeenNthCalledWith(2, {
      metadata: { app: 'fastgpt', deploymentId },
      page: 2,
      pageSize: 100
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('requires an image only when create is requested', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    await expect(client.create()).rejects.toThrow('createConfig.image');
  });

  it('reuses an already bound running SDK client', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(client, bound.sandbox);
    const managerCreate = vi.spyOn(SandboxManager, 'create');
    const connect = vi.spyOn(Sandbox, 'connect');

    await client.ensureRunning();

    expect(bound.getInfo).toHaveBeenCalledTimes(1);
    expect(managerCreate).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it.each(['Allocated', 'Pending'])(
    'waits for state %s to reach Running instead of failing',
    async (state) => {
      vi.useFakeTimers();
      try {
        const client = new OpenSandboxClient(CONNECTION);
        const bound = createSdkSandbox({
          info: [sdkInfo(state), sdkInfo(state), sdkInfo('Running')]
        });
        bindSandbox(client, bound.sandbox);

        const ensureRunning = client.ensureRunning();
        await vi.advanceTimersByTimeAsync(2_000);
        await ensureRunning;

        expect(client.status.state).toBe('Running');
        expect(bound.getInfo).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('waits for an allocated session resource discovered by metadata before connecting', async () => {
    vi.useFakeTimers();
    try {
      mockManager([sdkInfo('Allocated')], [sdkInfo('Allocated'), sdkInfo('Running')]);
      const bound = createSdkSandbox();
      const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValue(bound.sandbox);
      const client = new OpenSandboxClient(CONNECTION);

      const ensureRunning = client.ensureRunning();
      await vi.advanceTimersByTimeAsync(1_000);
      await ensureRunning;

      expect(connect).toHaveBeenCalledWith(expect.objectContaining({ sandboxId: 'sandbox-1' }));
      expect(client.status.state).toBe('Running');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['Failed', 'Unknown', 'Terminated'])('keeps terminal state %s fatal', async (state) => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox({ info: [sdkInfo(state)] });
    bindSandbox(client, bound.sandbox);

    await expect(client.ensureRunning()).rejects.toThrow('Sandbox error');
  });

  it.each(['Creating', 'Deleting', 'Stopping'])(
    'connectRunning with verifyHealth rejects %s without creating',
    async (state) => {
      mockManager([sdkInfo(state)]);
      const create = vi.spyOn(Sandbox, 'create');
      const connect = vi.spyOn(Sandbox, 'connect');
      const client = new OpenSandboxClient(CONNECTION);
      await expect(client.connectRunning({ verifyHealth: true })).rejects.toBeInstanceOf(
        SandboxStateError
      );
      expect(create).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    }
  );

  it('connectRunning binds an existing running sandbox and skips repeated connect when already bound', async () => {
    mockManager([sdkInfo()]);
    const bound = createSdkSandbox();
    vi.spyOn(Sandbox, 'connect').mockResolvedValue(bound.sandbox);
    const client = new OpenSandboxClient(CONNECTION);
    await client.connectRunning();
    await client.connectRunning();
    expect(client.id).toBe('sandbox-1');
    expect(Sandbox.connect).toHaveBeenCalledTimes(1);
  });

  it('connectRunning uses optimistic skipHealthCheck connect when remoteSandboxId is known and verifyHealth is false', async () => {
    const managerCreate = vi.spyOn(SandboxManager, 'create');
    const bound = createSdkSandbox({ id: 'remote-fast-1' });
    const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValueOnce(bound.sandbox);

    const client = new OpenSandboxClient({
      ...CONNECTION,
      remoteSandboxId: 'remote-fast-1'
    });
    await client.connectRunning();

    expect(managerCreate).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'remote-fast-1',
        skipHealthCheck: true,
        readyTimeoutSeconds: 10
      })
    );

    // Subsequent optimistic call reuses the bound sandbox with 0 extra RPCs
    await client.connectRunning();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('connectRunning reports a missing session without creating', async () => {
    mockManager();
    const create = vi.spyOn(Sandbox, 'create');
    await expect(new OpenSandboxClient(CONNECTION).connectRunning()).rejects.toBeInstanceOf(
      SandboxNotFoundError
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('deletes every visible physical resource for a stable session', async () => {
    const first = sdkInfo('Running', 'first');
    const second = sdkInfo('Running', 'second');
    const { killSandbox } = mockManager(
      [first, second],
      [first, notFoundError(), second, notFoundError()]
    );
    await new OpenSandboxClient(CONNECTION).delete();
    expect(killSandbox.mock.calls).toEqual([['first'], ['second']]);
  });

  it('rejects verified connecting, reusing, or deleting a container owned by another deployment', async () => {
    const foreign = {
      ...sdkInfo('Running', 'foreign-1'),
      metadata: {
        app: 'fastgpt',
        deploymentId: 'f'.repeat(32),
        sessionId: CONNECTION.sessionId
      }
    };
    const { killSandbox } = mockManager([foreign], [foreign]);
    const connect = vi.spyOn(Sandbox, 'connect');

    const client = new OpenSandboxClient({
      ...CONNECTION,
      remoteSandboxId: 'foreign-1'
    });

    await expect(client.connectRunning({ verifyHealth: true })).rejects.toThrow(
      'OpenSandbox ownership mismatch'
    );
    await expect(client.ensureRunning()).rejects.toThrow('OpenSandbox ownership mismatch');
    await expect(client.delete('foreign-1')).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining('OpenSandbox ownership mismatch')
      })
    });
    expect(connect).not.toHaveBeenCalled();
    expect(killSandbox).not.toHaveBeenCalled();
  });

  it('deletes a bound sandbox across Stopping cleanup until 404 and releases its client', async () => {
    vi.useFakeTimers();
    try {
      const client = new OpenSandboxClient(CONNECTION);
      const bound = createSdkSandbox({ info: [sdkInfo('Stopping'), notFoundError()] });
      bindSandbox(client, bound.sandbox);

      const deletePromise = client.delete();
      await vi.advanceTimersByTimeAsync(1_000);
      await deletePromise;

      expect(bound.sandbox.kill).toHaveBeenCalledTimes(1);
      expect(bound.getInfo).toHaveBeenCalledTimes(2);
      expect(bound.sandbox.close).toHaveBeenCalledTimes(1);
      expect(client.status.state).toBe('UnExist');
      expect(client.id).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses native file and streaming reads', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    bindSandbox(client, bound.sandbox);

    await client.readFiles(['file.txt']);
    const chunks: Uint8Array[] = [];
    for await (const chunk of client.readFileStream('file.txt')) chunks.push(chunk);

    expect(bound.readBytes).toHaveBeenCalledWith('/workspace/file.txt');
    expect(bound.readBytesStream).toHaveBeenCalledWith('/workspace/file.txt');
    expect(new TextDecoder().decode(chunks[0])).toBe('stream');
    expect(bound.readBytes).toHaveBeenCalledTimes(1);
  });

  it('applies every edit when one call edits the same file more than once', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    const files = new Map([
      ['/workspace/app.py', 'import x\nuse(x)\n'],
      ['/workspace/util.py', 'a = 1\n']
    ]);
    const applyEdits = (
      entries: Array<{ path: string; oldContent: string; newContent: string }>
    ) => {
      const body: Record<string, { old: string; new: string }> = {};
      for (const entry of entries) {
        body[entry.path] = { old: entry.oldContent, new: entry.newContent };
      }
      return Object.entries(body).map(([path, edit]) => {
        const content = files.get(path) ?? '';
        files.set(path, content.split(edit.old).join(edit.new));
        return { path, replacedCount: content.split(edit.old).length - 1 };
      });
    };
    bound.replaceContentsDetailed.mockImplementation(async (entries) => applyEdits(entries));
    bindSandbox(client, bound.sandbox);

    await client.replaceContent([
      { path: 'app.py', oldContent: 'import x', newContent: 'import y' },
      { path: 'util.py', oldContent: 'a = 1', newContent: 'a = 2' },
      { path: '/workspace/./app.py', oldContent: 'import y', newContent: 'import z' },
      { path: '/workspace/app.py', oldContent: 'use(x)', newContent: 'use(z)' }
    ]);

    expect(files.get('/workspace/app.py')).toBe('import z\nuse(z)\n');
    expect(files.get('/workspace/util.py')).toBe('a = 2\n');
    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(3);
  });

  it('reports unmatched edits even when another file in the batch was edited', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    bound.replaceContentsDetailed.mockResolvedValue([
      { path: '/workspace/a.txt', replacedCount: 2 },
      { path: '/workspace/b.txt', replacedCount: 0 },
      { path: '/workspace/c.txt', replacedCount: 0 }
    ]);
    bindSandbox(client, bound.sandbox);

    const result = client.replaceContent([
      { path: 'a.txt', oldContent: 'old', newContent: 'new' },
      { path: 'b.txt', oldContent: 'missing', newContent: 'new' },
      { path: 'c.txt', oldContent: 'missing', newContent: 'new' }
    ]);

    await expect(result).rejects.toBeInstanceOf(SandboxException);
    await expect(result).rejects.toMatchObject({
      code: 'REPLACE_CONTENT_NOT_FOUND',
      message: expect.stringContaining('/workspace/b.txt, /workspace/c.txt')
    });
  });

  it('reports a zero-match response from a verbose request through the real SDK', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    const requests: Request[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      return url.searchParams.get('verbose') === 'true'
        ? Response.json({ '/workspace/a.txt': { replacedCount: 0 } })
        : new Response(null, { status: 200 });
    };
    const options = { baseUrl: 'http://sandbox.test', fetch: mockFetch };
    Object.defineProperty(bound.sandbox, 'files', {
      value: new FilesystemAdapter(createExecdClient(options), options)
    });
    bindSandbox(client, bound.sandbox);

    await expect(
      client.replaceContent([{ path: 'a.txt', oldContent: 'missing', newContent: 'new' }])
    ).rejects.toMatchObject({
      name: 'SandboxException',
      code: 'REPLACE_CONTENT_NOT_FOUND'
    });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    const url = new URL(request.url);
    expect(url.pathname).toBe('/files/replace');
    expect(url.searchParams.get('verbose')).toBe('true');
    const body: unknown = await request.json();
    expect(body).toStrictEqual({ '/workspace/a.txt': { old: 'missing', new: 'new' } });
  });

  it('stops later edits to the same file after an unmatched edit', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    bound.replaceContentsDetailed.mockResolvedValue([
      { path: '/workspace/a.txt', replacedCount: 0 }
    ]);
    bindSandbox(client, bound.sandbox);

    await expect(
      client.replaceContent([
        { path: 'a.txt', oldContent: 'missing', newContent: 'new' },
        { path: '/workspace/a.txt', oldContent: 'new', newContent: 'later' }
      ])
    ).rejects.toBeInstanceOf(SandboxException);

    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(1);
  });

  it('propagates replacement request failures without sending later batches', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    const error = new Error('Replace contents failed');
    bound.replaceContentsDetailed.mockRejectedValue(error);
    bindSandbox(client, bound.sandbox);

    await expect(
      client.replaceContent([
        { path: 'a.txt', oldContent: 'old', newContent: 'new' },
        { path: '/workspace/a.txt', oldContent: 'new', newContent: 'later' }
      ])
    ).rejects.toBe(error);

    expect(bound.replaceContentsDetailed).toHaveBeenCalledTimes(1);
  });

  it('connects directly by remoteSandboxId in verifyHealth mode and surfaces unhealthy workspace as SandboxStateError', async () => {
    const { getSandboxInfo } = mockManager([], sdkInfo('Running', 'remote-direct-1'));
    const bound = createSdkSandbox({ id: 'remote-direct-1' });
    const connect = vi.spyOn(Sandbox, 'connect').mockResolvedValueOnce(bound.sandbox);

    const client = new OpenSandboxClient({
      ...CONNECTION,
      remoteSandboxId: 'remote-direct-1'
    });
    await client.connectRunning({ verifyHealth: true });
    expect(getSandboxInfo).toHaveBeenCalledWith('remote-direct-1');
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'remote-direct-1', readyTimeoutSeconds: 10 })
    );

    // Subsequent FUSE /workspace failure on bound sandbox triggers SandboxStateError for self-healing
    bound.getFileInfo.mockRejectedValueOnce(new Error('ENOTCONN'));
    await expect(client.connectRunning({ verifyHealth: true })).rejects.toBeInstanceOf(
      SandboxStateError
    );

    // Connect readiness timeout also maps to SandboxStateError rather than generic ConnectionError
    vi.spyOn(Sandbox, 'connect').mockRejectedValueOnce(
      new SandboxReadyTimeoutException({ message: 'workspace health check timed out' })
    );
    await expect(client.connect('remote-direct-1')).rejects.toBeInstanceOf(SandboxStateError);
  });

  it('passes native octal modes, batches deleteFiles, and reads SDK exitCode from error events', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    bound.getFileInfo.mockResolvedValue({
      '/workspace/file.txt': { path: '/workspace/file.txt', type: 'file', mode: 644 }
    });
    bound.commandRunStream.mockImplementationOnce(() =>
      createCommandStream([
        { type: 'init', text: 'execution-err', timestamp: Date.now() },
        {
          type: 'error',
          error: { ename: 'CommandExecError', evalue: 'command failed', exit_code: 42 },
          timestamp: Date.now()
        }
      ])
    );
    bindSandbox(client, bound.sandbox);

    await client.writeFiles([{ path: 'file.txt', data: 'x', mode: 644 }]);
    const info = await client.getFileInfo(['file.txt']);
    await client.deleteFiles(['a.txt', 'b.txt']);
    const execResult = await client.execute('exit 42');

    expect(bound.writeFiles).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/file.txt', mode: 644 })
    ]);
    expect(info.get('/workspace/file.txt')?.mode).toBe(644);
    expect(bound.deleteFiles).toHaveBeenCalledExactlyOnceWith([
      '/workspace/a.txt',
      '/workspace/b.txt'
    ]);
    expect(execResult.exitCode).toBe(42);
  });

  it('stops consuming and aborts the stream immediately after execution_complete', async () => {
    const client = new OpenSandboxClient(CONNECTION);
    const bound = createSdkSandbox();
    let consumedAfterTerminal = false;
    let streamSignal: AbortSignal | undefined;
    bound.commandRunStream.mockImplementation((_command, _options, signal) =>
      (async function* () {
        streamSignal = signal;
        yield { type: 'init', text: 'execution-1', timestamp: Date.now() };
        yield { type: 'stdout', text: 'hello', timestamp: Date.now() };
        yield { type: 'execution_complete', execution_time: 2, timestamp: Date.now() };
        consumedAfterTerminal = true;
        yield { type: 'stdout', text: 'late output', timestamp: Date.now() };
      })()
    );
    bindSandbox(client, bound.sandbox);

    const result = await client.execute('echo hello');

    expect(result).toEqual({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
      durationMs: 2,
      truncated: false
    });
    expect(consumedAfterTerminal).toBe(false);
    expect(streamSignal?.aborted).toBe(true);
  });

  it('uploads multiple in-memory files in a single multipart POST /files/upload and falls back per-file on failure', async () => {
    const client = new OpenSandboxClient({
      ...CONNECTION,
      apiKey: 'os-api-key'
    });
    const bound = createSdkSandbox();
    (bound.sandbox as any).getEndpoint = vi.fn(async () => ({
      endpoint: 'opensandbox.local:8090/v1/sandboxes/sandbox-1/proxy/44772',
      headers: { 'X-Proxy': '1' }
    }));
    bindSandbox(client, bound.sandbox);

    const capturedRequests: Request[] = [];
    const connection = (client as any).connection;
    const uploadFetchSpy = vi
      .spyOn(connection, 'uploadFetch', 'get')
      .mockReturnValue(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        capturedRequests.push(req);
        return new Response(null, { status: 200 });
      });

    await expect(
      client.writeFiles([
        { path: 'a.txt', data: 'alpha', mode: 644 },
        { path: 'sub/b.bin', data: new Uint8Array([1, 2, 3]) }
      ])
    ).resolves.toBeUndefined();
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].url).toBe(
      'http://opensandbox.local:8090/v1/sandboxes/sandbox-1/proxy/44772/files/upload'
    );
    expect(capturedRequests[0].headers.get('OPEN-SANDBOX-API-KEY')).toBe('os-api-key');
    expect(capturedRequests[0].headers.get('X-Proxy')).toBe('1');
    const formData = await capturedRequests[0].formData();
    expect(formData.getAll('metadata')).toHaveLength(2);
    expect(formData.getAll('file')).toHaveLength(2);
    expect(bound.writeFiles).not.toHaveBeenCalled();

    // When batch upload returns 500, falls back to concurrent per-file SDK writeFiles and rejects on failure
    uploadFetchSpy.mockReturnValueOnce(
      async () => new Response('partial failure', { status: 500 })
    );
    bound.writeFiles
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      client.writeFiles([
        { path: 'ok.txt', data: 'ok' },
        { path: 'readonly/fail.txt', data: 'nope' }
      ])
    ).rejects.toThrow('permission denied');
    expect(bound.writeFiles).toHaveBeenCalledTimes(2);
  });
});
