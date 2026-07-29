import { describe, expect, it, vi } from 'vitest';
import { BaseSandboxAdapter } from '@/adapters/base';
import { FeatureNotSupportedError, SandboxReadyTimeoutError, TimeoutError } from '@/errors';
import { CommandFilesystemPolyfill } from '@/polyfills/command-filesystem';
import type { ExecuteOptions, ExecuteResult, SandboxCapabilities, SandboxInfo } from '@/types';

const CAPABILITIES: SandboxCapabilities = {
  command: { streaming: false, background: false, interrupt: false },
  filesystem: { streamingRead: true, streamingWrite: true },
  metrics: true,
  expirationRenewal: false
};

class TestAdapter extends BaseSandboxAdapter {
  readonly id = 'test-id';
  readonly provider = 'test';
  readonly capabilities = CAPABILITIES;

  constructor(
    private readonly executeHandler: (
      command: string,
      options?: ExecuteOptions
    ) => Promise<ExecuteResult> = async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    withPolyfill = false
  ) {
    super();
    if (withPolyfill) this.polyfillService = new CommandFilesystemPolyfill(this);
  }

  override get rootPath(): string {
    return '/workspace';
  }

  exposeNormalizePath(path?: string): string {
    return this.normalizePath(path);
  }

  async ensureRunning(): Promise<void> {}
  async create(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async delete(): Promise<void> {}
  async getInfo(): Promise<SandboxInfo | null> {
    return {
      id: this.id,
      entrypoint: [],
      status: this.status,
      createdAt: new Date()
    };
  }
  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    return this.executeHandler(command, options);
  }
}

describe('BaseSandboxAdapter', () => {
  it('normalizes relative paths against the provider root', () => {
    const adapter = new TestAdapter();

    expect(adapter.exposeNormalizePath()).toBe('/workspace');
    expect(adapter.exposeNormalizePath('./file.txt')).toBe('/workspace/file.txt');
    expect(adapter.exposeNormalizePath('file.txt')).toBe('/workspace/file.txt');
    expect(adapter.exposeNormalizePath('/tmp/file.txt')).toBe('/tmp/file.txt');
  });

  it('rejects optional command features instead of simulating them', async () => {
    const adapter = new TestAdapter();

    await expect(adapter.executeStream('echo test', {})).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.executeBackground('sleep 1')).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.interrupt('session')).rejects.toBeInstanceOf(FeatureNotSupportedError);
  });

  it('maps valid byte ranges and reports invalid ranges per file', async () => {
    const execute = vi.fn(
      async (command: string): Promise<ExecuteResult> => ({
        stdout: command.includes('base64') ? 'YWJj' : '',
        stderr: '',
        exitCode: 0
      })
    );
    const adapter = new TestAdapter(execute, true);

    const [result] = await adapter.readFiles(['file.txt'], { offset: 1, length: 3 });
    const [invalidResult] = await adapter.readFiles(['file.txt'], { offset: -1 });

    expect(result.error).toBeNull();
    expect(execute).toHaveBeenCalledWith(
      "tail -c +2 '/workspace/file.txt' | head -c 3 | base64 -w 0",
      undefined
    );
    expect(invalidResult.error).toBeInstanceOf(TypeError);
  });

  it('keeps relative paths normalized while streaming through the command polyfill', async () => {
    const adapter = new TestAdapter(undefined, true);
    const getFileInfo = vi
      .spyOn(adapter, 'getFileInfo')
      .mockResolvedValue(
        new Map([
          [
            '/workspace/file.txt',
            { path: '/workspace/file.txt', size: 3, isFile: true, isDirectory: false }
          ]
        ])
      );
    const readFiles = vi.spyOn(adapter, 'readFiles').mockResolvedValue([
      {
        path: '/workspace/file.txt',
        content: new TextEncoder().encode('abc'),
        error: null
      }
    ]);

    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.readFileStream('file.txt')) chunks.push(chunk);

    expect(getFileInfo).toHaveBeenCalledWith(['/workspace/file.txt']);
    expect(readFiles).toHaveBeenCalledWith(['/workspace/file.txt'], { offset: 0, length: 3 });
    expect(new TextDecoder().decode(chunks[0])).toBe('abc');
  });

  it('reports lifecycle-specific timeout errors', async () => {
    const readyAdapter = new TestAdapter(undefined, true);
    vi.spyOn(readyAdapter, 'ping').mockResolvedValue(false);
    vi.spyOn(
      readyAdapter as unknown as { sleep(ms: number): Promise<void> },
      'sleep'
    ).mockResolvedValue();

    await expect(readyAdapter.waitUntilReady(1)).rejects.toBeInstanceOf(SandboxReadyTimeoutError);

    const deletingAdapter = new TestAdapter();
    vi.spyOn(deletingAdapter, 'getInfo').mockResolvedValue({
      id: deletingAdapter.id,
      entrypoint: [],
      status: deletingAdapter.status,
      createdAt: new Date()
    });
    vi.spyOn(
      deletingAdapter as unknown as { sleep(ms: number): Promise<void> },
      'sleep'
    ).mockResolvedValue();

    await expect(deletingAdapter.waitUntilDeleted(1)).rejects.toBeInstanceOf(TimeoutError);
  });
});
