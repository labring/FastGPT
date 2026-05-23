import { afterEach, describe, expect, it, vi } from 'vitest';
import { SealosDevboxAdapter, type SealosDevboxConfig } from '@/adapters/SealosDevboxAdapter';

const CONFIG: SealosDevboxConfig = {
  baseUrl: 'https://devbox-server.example.com',
  token: 'test-token',
  sandboxId: 'devbox-1'
};

const createDevboxInfo = () => ({
  name: 'devbox-1',
  state: { phase: 'Running' },
  ssh: {},
  gateway: {
    url: 'https://devbox-gateway.staging-usw-1.sealos.io/codex/abc123',
    port: 1317,
    uniqueID: 'abc123'
  },
  codeServerGateway: {
    url: 'https://devbox-gateway.staging-usw-1.sealos.io/code-server/abc123',
    password: 'password',
    port: 1318,
    uniqueID: 'abc123'
  }
});

const createDevboxInfoResponse = (data = createDevboxInfo()) => ({
  json: async () => ({
    code: 200,
    message: 'ok',
    data
  })
});

describe('SealosDevboxAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should map unified create spec into Devbox create request', () => {
    const adapter = new SealosDevboxAdapter(CONFIG, {
      image: { repository: 'runtime/fastgpt', tag: 'latest' },
      workingDir: '/home/devbox/workspace',
      upstreamID: 'session-1',
      labels: [
        { key: 'teamId', value: 'team-1' },
        { key: 'sessionId', value: 'session-1' }
      ],
      kubeAccess: { enabled: true, roleTemplate: 'edit' },
      lifecycle: {
        pauseAt: '2026-05-08T10:00:00Z',
        archiveAfterPauseTime: '1h'
      }
    });

    const request = (
      adapter as unknown as { buildCreateRequest(): Record<string, unknown> }
    ).buildCreateRequest();

    expect(request).toEqual({
      name: 'devbox-1',
      image: 'runtime/fastgpt:latest',
      env: {
        CODEX_GATEWAY_CWD: '/home/devbox/workspace'
      },
      upstreamID: 'session-1',
      labels: [
        { key: 'teamId', value: 'team-1' },
        { key: 'sessionId', value: 'session-1' }
      ],
      kubeAccess: { enabled: true, roleTemplate: 'edit' },
      pauseAt: '2026-05-08T10:00:00Z',
      archiveAfterPauseTime: '1h'
    });
  });

  it('should use workingDir as the default root for relative paths and commands', async () => {
    const adapter = new SealosDevboxAdapter(CONFIG, {
      workingDir: '/home/sandbox/workspace'
    });
    const normalizePath = (adapter as any).normalizePath.bind(adapter) as (path?: string) => string;

    expect(normalizePath('path.txt')).toBe('/home/sandbox/workspace/path.txt');
    expect(normalizePath('./src/index.ts')).toBe('/home/sandbox/workspace/src/index.ts');
    expect(normalizePath('.')).toBe('/home/sandbox/workspace');

    const execMock = vi.fn(async () => ({
      code: 200,
      message: 'ok',
      data: {
        stdout: '/home/sandbox/workspace\n',
        stderr: '',
        exitCode: 0
      }
    }));
    (adapter as any).api = { exec: execMock };

    await expect(adapter.execute('pwd')).resolves.toMatchObject({
      stdout: '/home/sandbox/workspace\n',
      stderr: '',
      exitCode: 0
    });
    expect(execMock).toHaveBeenCalledWith('devbox-1', {
      command: ['sh', '-lc', "cd '/home/sandbox/workspace/' && pwd"],
      timeoutSeconds: undefined
    });
  });

  it('should allow an explicit httpgate domain override for non-code-server endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          code: 200,
          message: 'ok',
          data: {
            name: 'devbox-1',
            state: { phase: 'Running' },
            ssh: {},
            gateway: {
              url: 'https://custom-gateway.example.net/codex/abc123',
              uniqueID: 'from-info'
            }
          }
        })
      }))
    );

    const adapter = new SealosDevboxAdapter({
      ...CONFIG,
      httpgateDomain: 'https://apps.example.net'
    });

    await expect(adapter.getEndpoint(1317)).resolves.toMatchObject({
      host: 'devbox-from-info-1317.apps.example.net',
      port: 1317,
      protocol: 'https',
      url: 'https://devbox-from-info-1317.apps.example.net'
    });
  });

  it('should accept Devbox create success code 201', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          code: 201,
          message: 'created',
          data: { name: 'devbox-1' }
        })
      })
      .mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          message: 'ok',
          data: {
            name: 'devbox-1',
            state: { phase: 'Running' },
            ssh: {},
            gateway: {
              url: 'https://devbox-gateway.staging-usw-1.sealos.io/codex/abc123'
            }
          }
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);
    const createPromise = adapter.create();

    await vi.runAllTimersAsync();

    await expect(createPromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should stop Devbox through the stop endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        code: 200,
        message: 'ok',
        data: {
          name: 'devbox-1',
          namespace: 'ns-test',
          state: 'Stopped'
        }
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(adapter.status.state).toBe('Stopped');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://devbox-server.example.com/api/v1/devbox/devbox-1/stop',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should treat successful HTTP status as stop success when response code is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => ({
          message: 'ok',
          data: {
            name: 'devbox-1',
            namespace: 'ns-test',
            state: 'Stopped'
          }
        })
      }))
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(adapter.status.state).toBe('Stopped');
  });

  it('should reject when Devbox stop returns a failed envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          code: 500,
          message: 'stop failed',
          data: null
        })
      }))
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.stop()).rejects.toThrow('Failed to stop sandbox');
    expect(adapter.status.state).toBe('Stopping');
  });

  it('should treat not found Devbox as already stopped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          code: 404,
          message: 'devbox not found'
        })
      }))
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(adapter.status.state).toBe('Stopped');
  });

  it('should resume an existing Devbox when phase is Stopped', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createDevboxInfoResponse({
          ...createDevboxInfo(),
          state: { phase: 'Stopped' }
        })
      )
      .mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          message: 'ok',
          data: { name: 'devbox-1', state: 'Running' }
        })
      })
      .mockResolvedValueOnce(createDevboxInfoResponse());
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);
    const ensurePromise = adapter.ensureRunning();

    await vi.runAllTimersAsync();

    await expect(ensurePromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://devbox-server.example.com/api/v1/devbox/devbox-1/resume',
      expect.objectContaining({ method: 'POST' })
    );
    expect(adapter.status.state).toBe('Running');
  });

  it('should resume an existing Devbox when phase is Shutdown', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createDevboxInfoResponse({
          ...createDevboxInfo(),
          state: { phase: 'Shutdown' }
        })
      )
      .mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          message: 'ok',
          data: { name: 'devbox-1', state: 'Running' }
        })
      })
      .mockResolvedValueOnce(createDevboxInfoResponse());
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);
    const ensurePromise = adapter.ensureRunning();

    await vi.runAllTimersAsync();

    await expect(ensurePromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://devbox-server.example.com/api/v1/devbox/devbox-1/resume',
      expect.objectContaining({ method: 'POST' })
    );
    expect(adapter.status.state).toBe('Running');
  });

  it('should reject when Devbox resume returns a failed envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          code: 403,
          message: 'resume denied',
          data: null
        })
      }))
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.start()).rejects.toThrow('Failed to resume sandbox');
    expect(adapter.status.state).toBe('Starting');
  });

  it('should include the original Devbox phase when ensureRunning cannot recover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createDevboxInfoResponse({
          ...createDevboxInfo(),
          state: { phase: 'Unknown' }
        })
      )
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.ensureRunning()).rejects.toThrow(
      'Sandbox devbox-1 is in error state: Unknown'
    );
  });

  it('should retry transient Devbox upstream failures while ensuring running', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('no healthy upstream', {
          status: 503,
          headers: { 'content-type': 'text/plain' }
        })
      )
      .mockResolvedValueOnce(
        new Response('no healthy upstream', {
          status: 503,
          headers: { 'content-type': 'text/plain' }
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 200,
          message: 'ok',
          data: createDevboxInfo()
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);
    const ensurePromise = adapter.ensureRunning();

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(ensurePromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(adapter.status.state).toBe('Running');
  });

  it('should not retry non-transient non-JSON Devbox responses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('unauthorized', {
        status: 401,
        headers: { 'content-type': 'text/plain' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.ensureRunning()).rejects.toThrow('Failed to ensure sandbox running');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should delete the provided Devbox id', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => ({
      json: async () => ({
        code: String(input).includes('/api/v1/devbox/devbox-instance-1') ? 404 : 200,
        message: 'ok',
        data: null
      })
    }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.delete('devbox-instance-1')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://devbox-server.example.com/api/v1/devbox/devbox-instance-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(adapter.id).toBe('devbox-instance-1');
    expect(adapter.status.state).toBe('UnExist');
  });

  it('should reject when Devbox delete returns a failed envelope other than not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          code: 500,
          message: 'delete failed',
          data: null
        })
      }))
    );

    const adapter = new SealosDevboxAdapter(CONFIG);

    await expect(adapter.delete('devbox-instance-1')).rejects.toThrow('Failed to delete sandbox');
    expect(adapter.status.state).toBe('Deleting');
  });
});
