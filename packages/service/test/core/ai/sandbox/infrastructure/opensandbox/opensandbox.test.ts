import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSandboxApiException extends Error {
    statusCode: number;
    error?: { code?: string; message?: string };
    constructor({
      message,
      statusCode = 500,
      error
    }: {
      message: string;
      statusCode?: number;
      error?: { code?: string; message?: string };
    }) {
      super(message);
      this.statusCode = statusCode;
      this.error = error;
    }
  }
  class MockSandboxReadyTimeoutException extends Error {
    cause?: unknown;
    constructor(input: string | { message?: string; cause?: unknown } = 'ready timeout') {
      const opts = typeof input === 'string' ? { message: input } : input;
      super(opts.message);
      this.cause = opts.cause;
    }
  }
  class MockSandboxUnhealthyException extends Error {
    cause?: unknown;
    constructor(input: string | { message?: string; cause?: unknown } = 'unhealthy') {
      const opts = typeof input === 'string' ? { message: input } : input;
      super(opts.message);
      this.cause = opts.cause;
    }
  }

  return {
    MockSandboxApiException,
    MockSandboxReadyTimeoutException,
    MockSandboxUnhealthyException,
    sandboxCreate: vi.fn(),
    sandboxConnect: vi.fn(),
    managerCreate: vi.fn(),
    managerListSandboxInfos: vi.fn(),
    managerGetSandboxInfo: vi.fn(),
    managerKillSandbox: vi.fn(),
    managerClose: vi.fn()
  };
});

vi.mock('@alibaba-group/opensandbox', () => ({
  ConnectionConfig: class ConnectionConfig {
    domain: string;
    protocol: string;
    apiKey?: string;
    headers: Record<string, string>;
    useServerProxy: boolean;
    requestTimeoutSeconds?: number;
    constructor(opts: {
      domain: string;
      protocol?: string;
      apiKey?: string;
      headers?: Record<string, string>;
      useServerProxy?: boolean;
      requestTimeoutSeconds?: number;
    }) {
      this.domain = opts.domain;
      this.protocol = opts.protocol ?? (opts.domain.startsWith('http://') ? 'http' : 'https');
      this.apiKey = opts.apiKey;
      this.headers = opts.headers ?? {};
      this.useServerProxy = opts.useServerProxy ?? true;
      this.requestTimeoutSeconds = opts.requestTimeoutSeconds;
    }
    withTransportIfMissing() {
      return this;
    }
  },
  DEFAULT_EXECD_PORT: 44772,
  ExecutionEventDispatcher: class ExecutionEventDispatcher {
    private execution: any;
    private handlers: any;
    constructor(execution: any, handlers: any) {
      this.execution = execution;
      this.handlers = handlers;
    }
    async dispatch(event: any) {
      if (event.type === 'stdout') await this.handlers.onStdout?.({ text: event.text });
      if (event.type === 'stderr') await this.handlers.onStderr?.({ text: event.text });
      if (event.type === 'execution_complete') {
        this.execution.complete = { executionTimeMs: event.executionTimeMs ?? 5 };
      }
      if (event.type === 'error') {
        this.execution.error = { exitCode: event.exitCode, value: event.value };
      }
    }
  },
  SandboxApiException: mocks.MockSandboxApiException,
  SandboxReadyTimeoutException: mocks.MockSandboxReadyTimeoutException,
  SandboxUnhealthyException: mocks.MockSandboxUnhealthyException,
  Sandbox: {
    create: mocks.sandboxCreate,
    connect: mocks.sandboxConnect
  },
  SandboxManager: {
    create: (opts?: { connectionConfig?: unknown }) => {
      mocks.managerCreate(opts);
      return {
        listSandboxInfos: mocks.managerListSandboxInfos,
        getSandboxInfo: mocks.managerGetSandboxInfo,
        killSandbox: mocks.managerKillSandbox,
        close: mocks.managerClose
      };
    }
  }
}));

const resetTestSandboxConfig = () => {
  const snapshot = createDefaultInstanceConfig();
  snapshot.subservice.agentSandbox.enabled = true;
  Object.assign(snapshot.subservice.agentSandbox.opensandbox, {
    baseUrl: 'https://sandbox.example.com',
    apiKey: 'test-key',
    runtime: 'kubernetes',
    useServerProxy: true,
    image: 'fastgpt/sandbox:latest',
    cpuOvercommitFactor: 1,
    memoryOvercommitFactor: 1
  });
  Object.assign(snapshot.subservice.agentSandbox.common, {
    storageSizeGi: 10,
    cpuCount: 2,
    memoryMiB: 2048
  });
  (global as any).systemInstanceConfig = snapshot;
};
resetTestSandboxConfig();

import {
  ConnectionError,
  isConfirmedSandboxUnavailableError,
  isTransientSandboxConnectError,
  isUncertainControlPlaneError,
  SandboxNotFoundError,
  SandboxStateError
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import {
  connectToOpenSandbox,
  createRuntimeOpenSandboxClient,
  disconnectSandbox,
  killManagedOpenSandboxById,
  listManagedOpenSandboxes
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';

const createSdkSandbox = (id = 'remote-1', metadata?: Record<string, string>) => ({
  id,
  getInfo: vi.fn(async () => ({
    id,
    image: { uri: 'fastgpt/sandbox:latest' },
    entrypoint: ['/usr/local/bin/entrypoint.sh'],
    metadata: metadata ?? { app: 'fastgpt', sessionId: 'sb-1' },
    status: { state: 'Running' },
    createdAt: new Date('2026-01-01T00:00:00.000Z')
  })),
  close: vi.fn(async () => undefined),
  kill: vi.fn(async () => undefined),
  commands: {
    runStream: vi.fn(async function* () {
      yield { type: 'stdout', text: 'hello' };
      yield { type: 'execution_complete', executionTimeMs: 12 };
    })
  },
  files: {
    writeFiles: vi.fn(),
    deleteFiles: vi.fn(),
    getFileInfo: vi.fn()
  },
  getEndpoint: vi.fn()
});

describe('opensandbox client and lifecycle helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTestSandboxConfig();
    mocks.managerClose.mockResolvedValue(undefined);
    mocks.managerKillSandbox.mockResolvedValue(undefined);
  });

  it('creates a runtime container with sessionId, timeoutSeconds: null, 210s create vs 30s routine timeout, and AbortSignal/operationId without secureAccess', async () => {
    const sdkSandbox = createSdkSandbox('remote-1');
    const reboundSdkSandbox = createSdkSandbox('remote-1');
    mocks.sandboxCreate.mockResolvedValueOnce(sdkSandbox);
    mocks.sandboxConnect.mockResolvedValueOnce(reboundSdkSandbox);
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [],
      pagination: { hasNextPage: false }
    });

    const controller = new AbortController();
    const client = createRuntimeOpenSandboxClient({
      sandboxId: 'sb-1',
      volumes: [
        {
          name: 'workspace',
          pvc: { claimName: 'fastgpt-session-sb-1-abc' },
          mountPath: '/home/sandbox',
          readOnly: false
        }
      ]
    });

    await client.ensureRunning({ signal: controller.signal, operationId: 'op-create' });

    expect(mocks.managerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionConfig: expect.objectContaining({ requestTimeoutSeconds: 30 })
      })
    );
    expect(mocks.sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'fastgpt/sandbox:latest',
        timeoutSeconds: null,
        signal: controller.signal,
        connectionConfig: expect.objectContaining({ requestTimeoutSeconds: 210 }),
        metadata: expect.objectContaining({
          app: 'fastgpt',
          sessionId: 'sb-1',
          operationId: 'op-create'
        })
      })
    );
    expect(mocks.sandboxConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'remote-1',
        skipHealthCheck: true,
        connectionConfig: expect.objectContaining({ requestTimeoutSeconds: 30 })
      })
    );
    expect(sdkSandbox.close).toHaveBeenCalledTimes(1);
    expect(mocks.sandboxCreate.mock.calls[0]?.[0]).not.toHaveProperty('secureAccess');
    expect(mocks.sandboxCreate.mock.calls[0]?.[0]?.resource).not.toHaveProperty(
      'ephemeral-storage'
    );
    expect(client.rootPath).toBe('/home/sandbox/workspace');
    expect(client.id).toBe('remote-1');
  });

  it('fast-connects via remoteSandboxId without verifyHealth and maps 404 to SandboxNotFoundError', async () => {
    const sdkSandbox = createSdkSandbox('remote-99');
    mocks.sandboxConnect.mockResolvedValueOnce(sdkSandbox);

    const client = await connectToOpenSandbox({
      sandboxId: 'sb-1',
      remoteSandboxId: 'remote-99'
    });
    expect(client.id).toBe('remote-99');
    expect(mocks.sandboxConnect).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'remote-99', skipHealthCheck: true })
    );

    mocks.sandboxConnect.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'not found', statusCode: 404 })
    );
    await expect(
      connectToOpenSandbox({
        sandboxId: 'sb-1',
        remoteSandboxId: 'missing-id'
      })
    ).rejects.toBeInstanceOf(SandboxNotFoundError);

    mocks.sandboxConnect.mockRejectedValueOnce(
      new mocks.MockSandboxUnhealthyException('unhealthy')
    );
    await expect(
      connectToOpenSandbox({
        sandboxId: 'sb-1',
        remoteSandboxId: 'bad-id'
      })
    ).rejects.toBeInstanceOf(SandboxStateError);

    await disconnectSandbox(client);
    expect(sdkSandbox.close).toHaveBeenCalledTimes(1);
  });

  it('rejects verifyHealth connection when remote app label belongs to another app', async () => {
    mocks.managerGetSandboxInfo.mockResolvedValueOnce({
      id: 'remote-foreign',
      metadata: { app: 'other-app', sessionId: 'sb-1' },
      status: { state: 'Running' },
      createdAt: new Date()
    });

    await expect(
      connectToOpenSandbox({
        sandboxId: 'sb-1',
        remoteSandboxId: 'remote-foreign',
        verifyHealth: true
      })
    ).rejects.toThrow('OpenSandbox ownership mismatch');
  });

  it('lists and kills only managed sandboxes matching fastgpt app metadata', async () => {
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'r-1',
          metadata: { app: 'fastgpt', sessionId: 'sb-1' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'r-foreign',
          metadata: { app: 'other-app', sessionId: 'sb-2' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'r-deleted',
          metadata: { app: 'fastgpt', sessionId: 'sb-3' },
          status: { state: 'Deleted' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });

    const items = await listManagedOpenSandboxes();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'r-1', sessionId: 'sb-1', state: 'Running' });

    mocks.managerGetSandboxInfo.mockResolvedValueOnce({
      id: 'r-foreign',
      metadata: { app: 'other-app', sessionId: 'sb-2' },
      status: { state: 'Running' },
      createdAt: new Date()
    });
    await expect(
      killManagedOpenSandboxById({ sessionId: 'sb-2', remoteSandboxId: 'r-foreign' })
    ).rejects.toThrow('OpenSandbox managed ownership mismatch');
    expect(mocks.managerKillSandbox).not.toHaveBeenCalled();

    mocks.managerGetSandboxInfo.mockResolvedValueOnce({
      id: 'r-1',
      metadata: { app: 'fastgpt', sessionId: 'sb-1' },
      status: { state: 'Running' },
      createdAt: new Date()
    });
    await killManagedOpenSandboxById({ sessionId: 'sb-1', remoteSandboxId: 'r-1' });
    expect(mocks.managerKillSandbox).toHaveBeenCalledWith('r-1');
  });

  it('merges data-plane endpoint headers via OpenSandbox createDataPlaneHeaders', async () => {
    const proxySandbox = createSdkSandbox('remote-proxy');
    proxySandbox.getEndpoint.mockResolvedValueOnce({
      endpoint: 'sandbox.example.com/proxy/1318',
      headers: { 'X-Sandbox-Token': 'ep-token' }
    });
    mocks.sandboxConnect.mockResolvedValueOnce(proxySandbox);

    getTestInstanceConfig().subservice.agentSandbox.opensandbox.useServerProxy = true;
    const proxyClient = await connectToOpenSandbox({
      sandboxId: 'sb-1',
      remoteSandboxId: 'remote-proxy'
    });
    await expect(proxyClient.getEndpoint(1318)).resolves.toEqual({
      host: 'sandbox.example.com',
      port: 1318,
      protocol: 'https',
      url: 'https://sandbox.example.com/proxy/1318',
      headers: {
        'OPEN-SANDBOX-API-KEY': 'test-key',
        'X-Sandbox-Token': 'ep-token'
      }
    });

    const directSandbox = createSdkSandbox('remote-direct');
    directSandbox.getEndpoint.mockResolvedValueOnce({
      endpoint: '10.0.0.5:1318',
      headers: { 'X-Sandbox-Token': 'direct-token' }
    });
    mocks.sandboxConnect.mockResolvedValueOnce(directSandbox);

    getTestInstanceConfig().subservice.agentSandbox.opensandbox.useServerProxy = false;
    const directClient = await connectToOpenSandbox({
      sandboxId: 'sb-2',
      remoteSandboxId: 'remote-direct'
    });
    await expect(directClient.getEndpoint(1318)).resolves.toEqual({
      host: '10.0.0.5',
      port: 1318,
      protocol: 'https',
      url: 'https://10.0.0.5:1318',
      headers: {
        'X-Sandbox-Token': 'direct-token'
      }
    });
  });

  it('preserves exact chunk boundaries without inserting newlines in execute output', async () => {
    const sdkSandbox = createSdkSandbox('remote-chunks');
    sdkSandbox.commands.runStream.mockImplementationOnce(async function* () {
      yield { type: 'stdout', text: 'hel' };
      yield { type: 'stdout', text: 'lo\nwor' };
      yield { type: 'stdout', text: 'ld' };
      yield { type: 'stderr', text: 'warn-' };
      yield { type: 'stderr', text: '1' };
      yield { type: 'execution_complete', executionTimeMs: 5 };
    });
    mocks.sandboxConnect.mockResolvedValueOnce(sdkSandbox);
    const client = await connectToOpenSandbox({
      sandboxId: 'sb-1',
      remoteSandboxId: 'remote-chunks'
    });

    const res = await client.execute('printf ...');
    expect(res).toMatchObject({
      stdout: 'hello\nworld',
      stderr: 'warn-1',
      exitCode: 0,
      durationMs: 5,
      truncated: false
    });
  });

  it('cleans up duplicate session containers even when killing a bound sandbox', async () => {
    const sdkSandbox = createSdkSandbox('remote-primary');
    let killedPrimary = false;
    sdkSandbox.kill.mockImplementationOnce(async () => {
      killedPrimary = true;
    });
    sdkSandbox.getInfo.mockImplementation(async () => ({
      id: 'remote-primary',
      image: { uri: 'fastgpt/sandbox:latest' },
      entrypoint: ['/usr/local/bin/entrypoint.sh'],
      metadata: { app: 'fastgpt', sessionId: 'sb-1' },
      status: { state: killedPrimary ? 'Deleted' : 'Running' },
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    }));
    mocks.sandboxConnect.mockResolvedValueOnce(sdkSandbox);

    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-primary',
          metadata: { app: 'fastgpt', sessionId: 'sb-1' },
          status: { state: 'Deleted' },
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'remote-dup',
          metadata: { app: 'fastgpt', sessionId: 'sb-1' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });
    mocks.managerGetSandboxInfo
      .mockResolvedValueOnce({
        id: 'remote-dup',
        metadata: { app: 'fastgpt', sessionId: 'sb-1' },
        status: { state: 'Running' },
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
      .mockResolvedValueOnce({
        id: 'remote-dup',
        metadata: { app: 'fastgpt', sessionId: 'sb-1' },
        status: { state: 'Deleted' },
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      });

    const client = await connectToOpenSandbox({
      sandboxId: 'sb-1',
      remoteSandboxId: 'remote-primary'
    });
    await client.delete();

    expect(sdkSandbox.kill).toHaveBeenCalledTimes(1);
    expect(mocks.managerKillSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.managerKillSandbox).toHaveBeenCalledWith('remote-dup');
    expect(client.id).toBeUndefined();
  });

  it('aborts delete without killing remote containers when signal is aborted', async () => {
    const sdkSandbox = createSdkSandbox('remote-abort');
    mocks.sandboxConnect.mockResolvedValueOnce(sdkSandbox);
    const client = await connectToOpenSandbox({
      sandboxId: 'sb-abort',
      remoteSandboxId: 'remote-abort'
    });

    const preAborted = new AbortController();
    preAborted.abort(new Error('lease lost before delete'));
    await expect(client.delete({ signal: preAborted.signal })).rejects.toThrow(
      'lease lost before delete'
    );
    expect(sdkSandbox.kill).not.toHaveBeenCalled();
    expect(mocks.managerListSandboxInfos).not.toHaveBeenCalled();
    expect(mocks.managerKillSandbox).not.toHaveBeenCalled();

    const midController = new AbortController();
    const boundSandbox = createSdkSandbox('remote-mid');
    boundSandbox.getInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'not found', statusCode: 404 })
    );
    mocks.sandboxConnect.mockResolvedValueOnce(boundSandbox);
    const midClient = await connectToOpenSandbox({
      sandboxId: 'sb-mid',
      remoteSandboxId: 'remote-mid'
    });
    mocks.managerListSandboxInfos.mockImplementationOnce(async () => {
      midController.abort(new Error('lease lost mid-delete'));
      return {
        items: [
          {
            id: 'remote-dup-mid',
            metadata: { app: 'fastgpt', sessionId: 'sb-mid' },
            status: { state: 'Running' },
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ],
        pagination: { hasNextPage: false }
      };
    });

    await expect(midClient.delete({ signal: midController.signal })).rejects.toThrow(
      'lease lost mid-delete'
    );
    expect(mocks.managerKillSandbox).not.toHaveBeenCalled();
  });

  it('classifies uncertain control-plane transport errors accurately', () => {
    // 底层网络断连或网关 504 属于未决控制面异常
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', { cause: new TypeError('fetch failed') })
      )
    ).toBe(true);
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', {
          cause: new mocks.MockSandboxApiException({ message: 'Gateway Timeout', statusCode: 504 })
        })
      )
    ).toBe(true);

    // K8s POD_READY_TIMEOUT(504) 服务端已回滚 CR；已进入 waitUntilReady 轮询、4xx 拒绝或普通数据面异常均属于确定性状态
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', {
          cause: new mocks.MockSandboxApiException({
            message: 'Pod ready timeout',
            statusCode: 504,
            error: { code: 'KUBERNETES::POD_READY_TIMEOUT' }
          })
        })
      )
    ).toBe(false);
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', {
          cause: new mocks.MockSandboxReadyTimeoutException('ready timeout')
        })
      )
    ).toBe(false);
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', {
          cause: new mocks.MockSandboxApiException({ message: 'Invalid image', statusCode: 422 })
        })
      )
    ).toBe(false);
    expect(
      isUncertainControlPlaneError(
        new ConnectionError('Failed to create sandbox', { cause: new Error('unexpected') })
      )
    ).toBe(false);
    expect(isUncertainControlPlaneError(new Error('Sandbox restore HTTP failed (502)'))).toBe(
      false
    );
  });

  it('fences stale containers from superseded operations and reuses only matching operationId on ensureRunning', async () => {
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-late-old',
          metadata: { app: 'fastgpt', sessionId: 'sb-op', operationId: 'op-old' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });
    mocks.managerGetSandboxInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'not found', statusCode: 404 })
    );
    const freshSdk = createSdkSandbox('remote-op-new', {
      app: 'fastgpt',
      sessionId: 'sb-op',
      operationId: 'op-new'
    });
    mocks.sandboxCreate.mockResolvedValueOnce(freshSdk);
    mocks.sandboxConnect.mockResolvedValueOnce(
      createSdkSandbox('remote-op-new', {
        app: 'fastgpt',
        sessionId: 'sb-op',
        operationId: 'op-new'
      })
    );

    const client = createRuntimeOpenSandboxClient({ sandboxId: 'sb-op' });
    await client.ensureRunning({ operationId: 'op-new' });

    expect(mocks.managerKillSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.managerKillSandbox).toHaveBeenCalledWith('remote-late-old');
    expect(mocks.sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          app: 'fastgpt',
          sessionId: 'sb-op',
          operationId: 'op-new'
        })
      })
    );
    expect(client.id).toBe('remote-op-new');
    await disconnectSandbox(client);

    vi.clearAllMocks();
    mocks.managerClose.mockResolvedValue(undefined);
    mocks.managerKillSandbox.mockResolvedValue(undefined);
    const matchedSdk = createSdkSandbox('remote-op-match', {
      app: 'fastgpt',
      sessionId: 'sb-op-2',
      operationId: 'op-current'
    });
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-op-match',
          metadata: { app: 'fastgpt', sessionId: 'sb-op-2', operationId: 'op-current' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });
    mocks.sandboxConnect.mockResolvedValueOnce(matchedSdk);

    const reuseClient = createRuntimeOpenSandboxClient({ sandboxId: 'sb-op-2' });
    await reuseClient.ensureRunning({ operationId: 'op-current' });

    expect(mocks.managerKillSandbox).not.toHaveBeenCalled();
    expect(mocks.sandboxCreate).not.toHaveBeenCalled();
    expect(mocks.sandboxConnect).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'remote-op-match' })
    );
    await disconnectSandbox(reuseClient);
  });

  it('falls back to listBySessionId in getInfo and connectRunning when stale remoteSandboxId returns 404, and forwards operationId on Stopped rebuild', async () => {
    mocks.managerGetSandboxInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'not found', statusCode: 404 })
    );
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-replacement',
          metadata: { app: 'fastgpt', sessionId: 'sb-stale' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });

    const client = createRuntimeOpenSandboxClient({
      sandboxId: 'sb-stale',
      instanceId: 'remote-stale-gone'
    });
    const info = await client.getInfo();
    expect(info?.id).toBe('remote-replacement');

    const replacementSdk = createSdkSandbox('remote-replacement', {
      app: 'fastgpt',
      sessionId: 'sb-stale'
    });
    mocks.managerGetSandboxInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'not found', statusCode: 404 })
    );
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-replacement',
          metadata: { app: 'fastgpt', sessionId: 'sb-stale' },
          status: { state: 'Running' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });
    mocks.sandboxConnect.mockResolvedValueOnce(replacementSdk);

    const connectClient = createRuntimeOpenSandboxClient({ sandboxId: 'sb-stale' });
    await connectClient.connectRunning({
      verifyHealth: true,
      remoteSandboxId: 'remote-stale-gone'
    });
    expect(connectClient.id).toBe('remote-replacement');
    await disconnectSandbox(connectClient);

    // Stopped container with matching operationId must preserve operationId when resolveToRunning recreates.
    mocks.managerListSandboxInfos.mockResolvedValueOnce({
      items: [
        {
          id: 'remote-stopping-same-op',
          metadata: { app: 'fastgpt', sessionId: 'sb-rebuild', operationId: 'op-keep' },
          status: { state: 'Paused' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      pagination: { hasNextPage: false }
    });
    mocks.managerGetSandboxInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'gone', statusCode: 404 })
    );
    const rebuiltSdk = createSdkSandbox('remote-rebuilt-op', {
      app: 'fastgpt',
      sessionId: 'sb-rebuild',
      operationId: 'op-keep'
    });
    mocks.sandboxCreate.mockResolvedValueOnce(rebuiltSdk);
    mocks.sandboxConnect.mockResolvedValueOnce(
      createSdkSandbox('remote-rebuilt-op', {
        app: 'fastgpt',
        sessionId: 'sb-rebuild',
        operationId: 'op-keep'
      })
    );

    const rebuildClient = createRuntimeOpenSandboxClient({ sandboxId: 'sb-rebuild' });
    await rebuildClient.ensureRunning({ operationId: 'op-keep' });
    expect(mocks.managerKillSandbox).toHaveBeenCalledWith('remote-stopping-same-op');
    expect(mocks.sandboxCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          app: 'fastgpt',
          sessionId: 'sb-rebuild',
          operationId: 'op-keep'
        })
      })
    );
    await disconnectSandbox(rebuildClient);
    await disconnectSandbox(client);
  });

  it('preserves write order across mixed stream and inline entries and batches deleteFiles', async () => {
    const sdkSandbox = createSdkSandbox('remote-files');
    const writtenOrder: string[] = [];
    sdkSandbox.files.writeFiles.mockImplementation(async (entries: any[]) => {
      for (const entry of entries) {
        const isInline = typeof entry.data === 'string' || entry.data instanceof Uint8Array;
        if (!isInline) {
          for await (const _chunk of entry.data) {
            // Drain stream so streamedBytes accumulator runs
          }
        }
        writtenOrder.push(`${entry.path}:${isInline ? 'inline' : 'stream'}`);
      }
    });
    sdkSandbox.files.deleteFiles.mockResolvedValueOnce(undefined);
    mocks.sandboxConnect.mockResolvedValueOnce(sdkSandbox);

    const client = await connectToOpenSandbox({
      sandboxId: 'sb-files',
      remoteSandboxId: 'remote-files'
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      }
    });

    const results = await client.writeFiles([
      { path: 'a.txt', data: 'first' },
      { path: 'a.txt', data: stream },
      { path: 'a.txt', data: 'last' }
    ]);
    expect(results.map((r) => r.bytesWritten)).toEqual([5, 3, 4]);
    expect(writtenOrder).toEqual([
      '/home/sandbox/workspace/a.txt:inline',
      '/home/sandbox/workspace/a.txt:stream',
      '/home/sandbox/workspace/a.txt:inline'
    ]);

    const delResults = await client.deleteFiles(['a.txt', 'b.txt']);
    expect(sdkSandbox.files.deleteFiles).toHaveBeenCalledTimes(1);
    expect(sdkSandbox.files.deleteFiles).toHaveBeenCalledWith([
      '/home/sandbox/workspace/a.txt',
      '/home/sandbox/workspace/b.txt'
    ]);
    expect(delResults).toEqual([
      { path: '/home/sandbox/workspace/a.txt', success: true, error: null },
      { path: '/home/sandbox/workspace/b.txt', success: true, error: null }
    ]);

    await disconnectSandbox(client);
  });

  it('preserves transient 503/POD_IP_NOT_AVAILABLE readiness timeouts as ConnectionError and only maps confirmed non-dir workspace probes to SandboxStateError', async () => {
    const runningInfo = (id: string) => ({
      id,
      metadata: { app: 'fastgpt', sessionId: 'sb-err' },
      status: { state: 'Running' },
      createdAt: new Date()
    });

    // 1. connect() 遇到 503 / POD_IP_NOT_AVAILABLE / 无确认结果的 SandboxReadyTimeoutException 时必须抛 ConnectionError，不可误判为死亡
    for (const timeoutErr of [
      new mocks.MockSandboxReadyTimeoutException({
        message: 'Health check timed out',
        cause: new mocks.MockSandboxApiException({
          message: 'Service Unavailable',
          statusCode: 503
        })
      }),
      new mocks.MockSandboxReadyTimeoutException({
        message: 'Endpoint timed out',
        cause: new mocks.MockSandboxApiException({
          message: 'Pod IP not available',
          statusCode: 404,
          error: { code: 'KUBERNETES::POD_IP_NOT_AVAILABLE' }
        })
      }),
      new mocks.MockSandboxReadyTimeoutException({ message: 'ready budget expired' }),
      new mocks.MockSandboxUnhealthyException({
        message: 'Unhealthy probe error',
        cause: new mocks.MockSandboxApiException({
          message: 'Service Unavailable',
          statusCode: 503
        })
      })
    ]) {
      mocks.managerGetSandboxInfo.mockResolvedValueOnce(runningInfo('remote-503'));
      mocks.sandboxConnect.mockRejectedValueOnce(timeoutErr);

      const err = await connectToOpenSandbox({
        sandboxId: 'sb-err',
        remoteSandboxId: 'remote-503',
        verifyHealth: true
      }).catch((caught) => caught);

      expect(err).toBeInstanceOf(ConnectionError);
      expect(isConfirmedSandboxUnavailableError(err)).toBe(false);
      expect(isTransientSandboxConnectError(err)).toBe(true);
    }

    // 2. 只有探测真实收到非目录响应返回 false 导致 SandboxReadyTimeoutException 时，才映射为保留 cause 的 SandboxStateError
    const nonDirSdk = createSdkSandbox('remote-nondir', {
      app: 'fastgpt',
      sessionId: 'sb-err'
    });
    nonDirSdk.files.getFileInfo.mockResolvedValueOnce({
      '/home/sandbox/workspace': { type: 'file' }
    });
    mocks.managerGetSandboxInfo.mockResolvedValueOnce(runningInfo('remote-nondir'));
    mocks.sandboxConnect.mockImplementationOnce(
      async (opts: { healthCheck?: (sbx: any) => Promise<boolean> }) => {
        const healthy = await opts.healthCheck?.(nonDirSdk);
        expect(healthy).toBe(false);
        throw new mocks.MockSandboxReadyTimeoutException(
          'Health check returned false continuously.'
        );
      }
    );

    const stateErr = await connectToOpenSandbox({
      sandboxId: 'sb-err',
      remoteSandboxId: 'remote-nondir',
      verifyHealth: true
    }).catch((caught) => caught);
    expect(stateErr).toBeInstanceOf(SandboxStateError);
    expect(stateErr.cause).toBeInstanceOf(mocks.MockSandboxReadyTimeoutException);
    expect(isConfirmedSandboxUnavailableError(stateErr)).toBe(true);

    // 3. FILE_NOT_FOUND(404) 与 POD_IP_NOT_AVAILABLE(404) 绝不命中已确认容器失效
    expect(
      isConfirmedSandboxUnavailableError(
        new mocks.MockSandboxApiException({
          message: 'missing file',
          statusCode: 404,
          error: { code: 'FILE_NOT_FOUND' }
        })
      )
    ).toBe(false);
    expect(
      isConfirmedSandboxUnavailableError(
        new mocks.MockSandboxApiException({
          message: 'pod ip pending',
          statusCode: 404,
          error: { code: 'KUBERNETES::POD_IP_NOT_AVAILABLE' }
        })
      )
    ).toBe(false);
  });

  it('distinguishes bound workspace probe 503 vs non-dir false vs FILE_NOT_FOUND, and releases stale bound handles on remoteSandboxId change', async () => {
    const boundSdk = createSdkSandbox('remote-1', { app: 'fastgpt', sessionId: 'sb-bound' });
    boundSdk.getInfo.mockResolvedValue({
      id: 'remote-1',
      image: { uri: 'fastgpt/sandbox:latest' },
      entrypoint: ['/usr/local/bin/entrypoint.sh'],
      metadata: { app: 'fastgpt', sessionId: 'sb-bound' },
      status: { state: 'Running' },
      createdAt: new Date()
    });
    mocks.sandboxConnect.mockResolvedValueOnce(boundSdk);

    const client = await connectToOpenSandbox({
      sandboxId: 'sb-bound',
      remoteSandboxId: 'remote-1'
    });

    // 已绑定客户端探测 503 -> ConnectionError（保留运行容器）
    boundSdk.files.getFileInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({ message: 'Service Unavailable', statusCode: 503 })
    );
    const err503 = await client.connectRunning({ verifyHealth: true }).catch((caught) => caught);
    expect(err503).toBeInstanceOf(ConnectionError);
    expect(isConfirmedSandboxUnavailableError(err503)).toBe(false);
    expect(isTransientSandboxConnectError(err503)).toBe(true);

    // 已绑定客户端遇到 FILE_NOT_FOUND 视为工作区目录尚未创建，健康通过
    boundSdk.files.getFileInfo.mockRejectedValueOnce(
      new mocks.MockSandboxApiException({
        message: 'missing dir',
        statusCode: 404,
        error: { code: 'FILE_NOT_FOUND' }
      })
    );
    await expect(client.connectRunning({ verifyHealth: true })).resolves.toBeUndefined();

    // 当权威 remoteSandboxId 切换到新代次容器时，必须先释放旧 boundSandbox 再连接新容器
    const nextSdk = createSdkSandbox('remote-2', { app: 'fastgpt', sessionId: 'sb-bound' });
    mocks.sandboxConnect.mockResolvedValueOnce(nextSdk);
    await client.connectRunning({ remoteSandboxId: 'remote-2' });
    expect(boundSdk.close).toHaveBeenCalledTimes(1);
    expect(client.id).toBe('remote-2');
    expect(mocks.sandboxConnect).toHaveBeenLastCalledWith(
      expect.objectContaining({ sandboxId: 'remote-2', skipHealthCheck: true })
    );

    // 对新绑定句柄，若 getFileInfo 明确返回非目录条目则抛 SandboxStateError 并释放绑定
    nextSdk.getInfo.mockResolvedValueOnce({
      id: 'remote-2',
      image: { uri: 'fastgpt/sandbox:latest' },
      entrypoint: ['/usr/local/bin/entrypoint.sh'],
      metadata: { app: 'fastgpt', sessionId: 'sb-bound' },
      status: { state: 'Running' },
      createdAt: new Date()
    });
    nextSdk.files.getFileInfo.mockResolvedValueOnce({
      '/home/sandbox/workspace': { type: 'file' }
    });
    await expect(client.connectRunning({ verifyHealth: true })).rejects.toBeInstanceOf(
      SandboxStateError
    );
    expect(nextSdk.close).toHaveBeenCalledTimes(1);
  });
});
