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
