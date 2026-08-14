import { afterEach, describe, expect, it, vi } from 'vitest';
import { SealosDevboxAdapter, type SealosDevboxConfig } from '@/adapters/sealos-devbox';

const CONFIG: SealosDevboxConfig = {
  baseUrl: 'https://devbox.example.com',
  token: 'token',
  sandboxId: 'sandbox-1'
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('SealosDevboxAdapter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the configured working directory as the relative filesystem root', () => {
    const adapter = new SealosDevboxAdapter(CONFIG, { workingDir: '/workspace/' });
    expect(adapter.rootPath).toBe('/workspace');
  });

  it('maps resource limits to Kubernetes quantities when creating a devbox', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/v1/devbox/sandbox-1')) {
        return jsonResponse({
          code: 200,
          message: 'running',
          data: {
            name: 'sandbox-1',
            image: 'registry.example.com/devbox/runtime:custom-v2',
            state: { phase: 'Running' },
            ssh: {}
          }
        });
      }
      if (String(input).includes('/exec')) {
        return jsonResponse({
          code: 200,
          message: 'ok',
          data: { exitCode: 0, stdout: '', stderr: '' }
        });
      }
      return jsonResponse({ code: 201, message: 'created', data: { name: 'sandbox-1' } });
    });
    const adapter = new SealosDevboxAdapter(CONFIG, {
      image: { repository: 'registry.example.com/devbox/runtime', tag: 'custom-v2' },
      resourceLimits: { cpuCount: 2, memoryMiB: 4096, storageSize: '10Gi' },
      upstreamID: 'session-123'
    });

    await adapter.create();

    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(request).toMatchObject({
      name: 'sandbox-1',
      image: 'registry.example.com/devbox/runtime:custom-v2',
      cpu: '2',
      memory: '4096Mi',
      storageLimit: '10Gi',
      upstreamID: 'session-123'
    });
  });

  it.each([
    ['cpuCount', { cpuCount: 0 }],
    ['cpuCount', { cpuCount: Number.NaN }],
    ['memoryMiB', { memoryMiB: -1 }],
    ['storageSize', { storageSize: ' ' }]
  ])('rejects invalid %s resource limits', (_name, resourceLimits) => {
    const adapter = new SealosDevboxAdapter(CONFIG, { resourceLimits });

    expect(() =>
      (
        adapter as unknown as { buildCreateRequest: () => Record<string, unknown> }
      ).buildCreateRequest()
    ).toThrow('Devbox');
  });

  it('maps stop to the reversible pause endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, message: 'paused', data: { name: 'sandbox-1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          message: 'ok',
          data: {
            name: 'sandbox-1',
            image: 'node:20',
            creationTimestamp: '2026-01-01T00:00:00.000Z',
            state: { phase: 'Paused' },
            ssh: {}
          }
        })
      );
    const adapter = new SealosDevboxAdapter(CONFIG);

    await adapter.stop();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://devbox.example.com/api/v1/devbox/sandbox-1/pause'
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://devbox.example.com/api/v1/devbox/sandbox-1');
    expect(adapter.status.state).toBe('Stopped');
  });

  it('retries the command readiness probe after a pending pod', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new SealosDevboxAdapter(CONFIG);
      vi.spyOn(adapter, 'getInfo').mockResolvedValue({
        id: 'sandbox-1',
        image: { repository: 'node', tag: '20' },
        entrypoint: [],
        status: { state: 'Running' },
        createdAt: new Date()
      });
      const executeMock = vi
        .spyOn(adapter, 'execute')
        .mockRejectedValueOnce(
          Object.assign(new Error('Command execution failed: pod is not running: Pending'), {
            commandError: new Error('pod is not running: Pending')
          })
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const ensurePromise = adapter.ensureRunning();
      await vi.advanceTimersByTimeAsync(1_000);
      await ensurePromise;

      expect(executeMock).toHaveBeenCalledTimes(2);
      expect(executeMock).toHaveBeenCalledWith('true', { timeoutMs: 5_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { stderr: 'permission denied', stdout: '', expected: 'permission denied' },
    { stderr: '', stdout: 'stdout failure', expected: 'stdout failure' },
    { stderr: '', stdout: '', expected: 'Sandbox command probe failed' }
  ])(
    'reports a non-retryable command result as $expected',
    async ({ stderr, stdout, expected }) => {
      const adapter = new SealosDevboxAdapter(CONFIG);
      vi.spyOn(adapter, 'getInfo').mockResolvedValue({
        id: 'sandbox-1',
        image: { repository: 'node', tag: '20' },
        entrypoint: [],
        status: { state: 'Running' },
        createdAt: new Date()
      });
      vi.spyOn(adapter, 'execute').mockResolvedValue({
        stdout,
        stderr,
        exitCode: 1
      });

      await expect(adapter.ensureRunning()).rejects.toThrow(expected);
    }
  );

  it('throws immediately when the command readiness probe is not retryable', async () => {
    const adapter = new SealosDevboxAdapter(CONFIG);
    vi.spyOn(adapter, 'getInfo').mockResolvedValue({
      id: 'sandbox-1',
      image: { repository: 'node', tag: '20' },
      entrypoint: [],
      status: { state: 'Running' },
      createdAt: new Date()
    });
    const executeMock = vi.spyOn(adapter, 'execute').mockRejectedValue(
      Object.assign(new Error('wrapper failed'), {
        commandError: new Error('permission denied')
      })
    );

    await expect(adapter.ensureRunning()).rejects.toThrow('wrapper failed');
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('throws the last retryable command readiness error after timeout', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new SealosDevboxAdapter(CONFIG);
      vi.spyOn(adapter, 'getInfo').mockResolvedValue({
        id: 'sandbox-1',
        image: { repository: 'node', tag: '20' },
        entrypoint: [],
        status: { state: 'Running' },
        createdAt: new Date()
      });
      const executeMock = vi.spyOn(adapter, 'execute').mockRejectedValue(
        Object.assign(new Error('outer retryable failure'), {
          cause: new Error('exec command timeout')
        })
      );

      const ensurePromise = adapter.ensureRunning();
      const assertion = expect(ensurePromise).rejects.toThrow('outer retryable failure');
      await vi.advanceTimersByTimeAsync(300_000);

      await assertion;
      expect(executeMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('streams uploads and converts POSIX mode to the API octal string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'ok',
        data: { sizeBytes: 3 }
      })
    );
    const adapter = new SealosDevboxAdapter(CONFIG);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      }
    });

    const [result] = await adapter.writeFiles([{ path: 'file.bin', data: stream, mode: 0o644 }]);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { duplex?: string };
    expect(url).toContain('path=%2Fhome%2Fdevbox%2Fworkspace%2Ffile.bin');
    expect(url).toContain('mode=0644');
    expect(init.body).toBe(stream);
    expect(init.duplex).toBe('half');
    expect(result).toMatchObject({ bytesWritten: 3, error: null });
  });

  it('returns the native response body as a download stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('native'));
            controller.close();
          }
        }),
        { status: 200 }
      )
    );
    const adapter = new SealosDevboxAdapter(CONFIG);
    const chunks: Uint8Array[] = [];

    for await (const chunk of adapter.readFileStream('file.txt')) chunks.push(chunk);

    expect(new TextDecoder().decode(chunks[0])).toBe('native');
  });

  it('passes abort signal, environment, timeout, and bounded output through execute', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        code: 200,
        message: 'ok',
        data: {
          exitCode: 0,
          stdout: '0123456789',
          stderr: '',
          executedAt: '2026-01-01T00:00:00.000Z'
        }
      })
    );
    const adapter = new SealosDevboxAdapter(CONFIG);
    const controller = new AbortController();

    const result = await adapter.execute('printf "$VALUE"', {
      env: { VALUE: 'hello world' },
      timeoutMs: 1_500,
      maxOutputBytes: 5,
      signal: controller.signal
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      command: string[];
      timeoutSeconds: number;
    };
    expect(body.command[2]).toContain("export VALUE='hello world'");
    expect(body.timeoutSeconds).toBe(2);
    expect(init.signal).toBe(controller.signal);
    expect(result.stdout).toBe('56789');
    expect(result.truncated).toBe(true);
  });
});
