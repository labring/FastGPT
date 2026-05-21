import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureNotSupportedError, SandboxReadyTimeoutError } from '@/errors';
import { BaseSandboxAdapter } from '@/adapters/BaseSandboxAdapter';
import { CommandPolyfillService } from '@/polyfill/CommandPolyfillService';
import { MockSandboxAdapter } from '../../mocks/MockSandboxAdapter';
import type { ExecuteResult, SandboxInfo } from '@/types';

class FallbackAdapter extends BaseSandboxAdapter {
  readonly id = 'fallback-id';
  readonly provider = 'fallback';

  async ensureRunning(): Promise<void> {}
  async create(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async delete(): Promise<void> {}
  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this.id,
      image: { repository: 'fallback', tag: 'latest' },
      entrypoint: [],
      status: this._status,
      createdAt: new Date()
    };
  }

  async execute(_command: string): Promise<ExecuteResult> {
    return {
      stdout: 'fallback-stdout',
      stderr: 'fallback-stderr',
      exitCode: 0,
      truncated: false
    };
  }

  // Expose protected method for testing
  normalizePath(path?: string): string {
    return super.normalizePath(path);
  }
}

class CustomRootAdapter extends FallbackAdapter {
  override get rootPath(): string {
    return '/home/devbox';
  }
}

class NoPolyfillAdapter extends FallbackAdapter {
  constructor() {
    super();
    this.polyfillService = undefined;
  }
}

/**
 * Adapter that uses the base class polyfill delegation (does NOT override
 * filesystem/health methods). This lets us test the BaseSandboxAdapter
 * polyfill code paths directly.
 */
class PolyfillTestAdapter extends BaseSandboxAdapter {
  readonly id = 'polyfill-test-id';
  readonly provider = 'polyfill-test';

  private executeFn: (cmd: string) => Promise<ExecuteResult>;

  constructor(executeFn: (cmd: string) => Promise<ExecuteResult>) {
    super();
    this.executeFn = executeFn;
    this.polyfillService = new CommandPolyfillService(this);
  }

  async ensureRunning(): Promise<void> {}
  async create(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async delete(): Promise<void> {}
  async getInfo(): Promise<SandboxInfo | null> {
    return null;
  }

  async execute(command: string, _options?: unknown): Promise<ExecuteResult> {
    return this.executeFn(command);
  }
}

/** Helper: create a PolyfillTestAdapter with a simple command handler */
function createPolyfillAdapter(
  handler: (cmd: string) => ExecuteResult | Promise<ExecuteResult>
): PolyfillTestAdapter {
  return new PolyfillTestAdapter(async (cmd) => handler(cmd));
}

const ok = (stdout = ''): ExecuteResult => ({
  stdout,
  stderr: '',
  exitCode: 0,
  truncated: false
});

describe('BaseSandboxAdapter', () => {
  // ==================== status getter ====================

  it('should return status via getter', () => {
    const adapter = new FallbackAdapter();
    expect(adapter.status).toEqual({ state: 'Creating' });
  });

  // ==================== executeStream ====================

  it('should fallback executeStream to execute', async () => {
    const adapter = new FallbackAdapter();
    const stdoutChunks: string[] = [];

    await adapter.executeStream('echo test', {
      onStdout: (msg) => {
        stdoutChunks.push(msg.text);
      }
    });

    expect(stdoutChunks).toEqual(['fallback-stdout']);
  });

  it('should call onStderr when stderr is present', async () => {
    const adapter = new FallbackAdapter();
    const stderrChunks: string[] = [];

    await adapter.executeStream('echo test', {
      onStderr: (msg) => {
        stderrChunks.push(msg.text);
      }
    });

    expect(stderrChunks).toEqual(['fallback-stderr']);
  });

  it('should call onComplete handler in executeStream', async () => {
    const adapter = new FallbackAdapter();
    let completedResult: ExecuteResult | undefined;

    await adapter.executeStream('echo test', {
      onComplete: (result) => {
        completedResult = result;
      }
    });

    expect(completedResult).toBeDefined();
    expect(completedResult!.exitCode).toBe(0);
  });

  it('should handle executeStream with no handlers', async () => {
    const adapter = new FallbackAdapter();
    await adapter.executeStream('echo test', {});
  });

  // ==================== executeBackground / interrupt ====================

  it('should throw for executeBackground by default', async () => {
    const adapter = new FallbackAdapter();
    await expect(adapter.executeBackground('sleep 10')).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
  });

  it('should throw for interrupt by default', async () => {
    const adapter = new FallbackAdapter();
    await expect(adapter.interrupt('session-1')).rejects.toBeInstanceOf(FeatureNotSupportedError);
  });

  // ==================== renewExpiration ====================

  it('should throw for renewExpiration by default', async () => {
    const adapter = new FallbackAdapter();
    await expect(adapter.renewExpiration(3600)).rejects.toBeInstanceOf(FeatureNotSupportedError);
  });

  // ==================== waitUntilReady ====================

  it('should resolve waitUntilReady when ping succeeds', async () => {
    const adapter = new MockSandboxAdapter();
    await adapter.waitUntilReady();
  });

  it('should throw SandboxReadyTimeoutError when ping never succeeds', async () => {
    const adapter = createPolyfillAdapter(() => ({
      stdout: 'NOPE',
      stderr: '',
      exitCode: 1,
      truncated: false
    }));
    // Use a very short timeout and stub sleep to avoid real delays
    vi.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);

    await expect(adapter.waitUntilReady(1)).rejects.toBeInstanceOf(SandboxReadyTimeoutError);
  });

  // ==================== requirePolyfillService ====================

  it('should throw when polyfill service is missing', async () => {
    const adapter = new NoPolyfillAdapter();
    await expect(adapter.readFiles(['/any.txt'])).rejects.toBeInstanceOf(FeatureNotSupportedError);
  });

  it('should throw for each polyfill method when service is missing', async () => {
    const adapter = new NoPolyfillAdapter();
    await expect(adapter.writeFiles([{ path: '/a', data: 'x' }])).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.deleteFiles(['/a'])).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.moveFiles([{ source: '/a', destination: '/b' }])).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(
      adapter.replaceContent([{ path: '/a', oldContent: 'x', newContent: 'y' }])
    ).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.createDirectories(['/a'])).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.deleteDirectories(['/a'])).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.listDirectory('/a')).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.getFileInfo(['/a'])).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.setPermissions([{ path: '/a', mode: 0o755 }])).rejects.toBeInstanceOf(
      FeatureNotSupportedError
    );
    await expect(adapter.search('*.ts')).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.ping()).rejects.toBeInstanceOf(FeatureNotSupportedError);
    await expect(adapter.getMetrics()).rejects.toBeInstanceOf(FeatureNotSupportedError);
  });

  // ==================== Polyfill delegation tests ====================

  describe('polyfill delegation', () => {
    it('should delegate readFiles to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('base64')) return ok('aGVsbG8='); // "hello" in base64
        return ok();
      });

      const results = await adapter.readFiles(['/test.txt']);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
    });

    it('should handle readFiles with range option', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('dd ')) return ok('aGVs'); // partial base64
        return ok();
      });

      const results = await adapter.readFiles(['/test.txt'], { range: '0-3' });
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
    });

    it('should handle readFiles with invalid range', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const results = await adapter.readFiles(['/test.txt'], { range: 'abc-def' });
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeInstanceOf(Error);
    });

    it('should handle readFiles error from polyfill', async () => {
      const adapter = createPolyfillAdapter(() => ({
        stdout: '',
        stderr: 'No such file',
        exitCode: 1,
        truncated: false
      }));

      const results = await adapter.readFiles(['/missing.txt']);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeInstanceOf(Error);
    });

    it('should delegate writeFiles with string data', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const results = await adapter.writeFiles([{ path: '/test.txt', data: 'hello' }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
    });

    it('should delegate writeFiles with Uint8Array data', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const results = await adapter.writeFiles([{ path: '/test.bin', data }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
      expect(results[0].bytesWritten).toBe(5);
    });

    it('should delegate writeFiles with ArrayBuffer data', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const buf = new ArrayBuffer(4);
      new Uint8Array(buf).set([1, 2, 3, 4]);
      const results = await adapter.writeFiles([{ path: '/test.bin', data: buf }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
      expect(results[0].bytesWritten).toBe(4);
    });

    it('should delegate writeFiles with Blob data', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const blob = new Blob(['hello']);
      const results = await adapter.writeFiles([{ path: '/test.txt', data: blob }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
    });

    it('should delegate writeFiles with ReadableStream data', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([65, 66]));
          controller.enqueue(new Uint8Array([67, 68]));
          controller.close();
        }
      });
      const results = await adapter.writeFiles([{ path: '/test.bin', data: stream }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeNull();
      expect(results[0].bytesWritten).toBe(4);
    });

    it('should handle writeFiles error', async () => {
      const adapter = createPolyfillAdapter(() => ({
        stdout: '',
        stderr: 'Permission denied',
        exitCode: 1,
        truncated: false
      }));

      const results = await adapter.writeFiles([{ path: '/readonly.txt', data: 'x' }]);
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeInstanceOf(Error);
      expect(results[0].bytesWritten).toBe(0);
    });

    it('should delegate deleteFiles to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const results = await adapter.deleteFiles(['/test.txt']);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should delegate moveFiles to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());
      await adapter.moveFiles([{ source: '/a.txt', destination: '/b.txt' }]);
    });

    it('should delegate replaceContent to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());
      await adapter.replaceContent([{ path: '/a.txt', oldContent: 'foo', newContent: 'bar' }]);
    });

    it('should delegate createDirectories to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());
      await adapter.createDirectories(['/new-dir']);
    });

    it('should delegate deleteDirectories to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());
      await adapter.deleteDirectories(['/old-dir']);
    });

    it('should delegate listDirectory to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('ls -la')) {
          return ok('total 4\n-rw-r--r-- 1 user group 100 2024-01-15T10:30:00 file.txt\n');
        }
        return ok();
      });

      const entries = await adapter.listDirectory('/test');
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('file.txt');
    });

    it('should delegate getFileInfo to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('stat'))
          return ok('1024|1700000000|1700000000|644|user|group|regular file');
        return ok();
      });

      const info = await adapter.getFileInfo(['/test.txt']);
      expect(info.get('/test.txt')).toBeDefined();
    });

    it('should delegate setPermissions to polyfillService', async () => {
      const adapter = createPolyfillAdapter(() => ok());
      await adapter.setPermissions([{ path: '/test.txt', mode: 0o755 }]);
    });

    it('should delegate search to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('find')) return ok('/src/file.ts\n');
        return ok();
      });

      const results = await adapter.search('*.ts', '/src');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should delegate ping to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('PING')) return ok('PING');
        return ok();
      });

      const result = await adapter.ping();
      expect(result).toBe(true);
    });

    it('should delegate getMetrics to polyfillService', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('nproc')) return ok('4');
        if (cmd.includes('meminfo')) {
          return ok('MemTotal: 8192000 kB\nMemFree: 4096000 kB\nMemAvailable: 6144000 kB');
        }
        return ok();
      });

      const metrics = await adapter.getMetrics();
      expect(metrics.cpuCount).toBe(4);
      expect(metrics.memoryTotalMiB).toBeGreaterThan(0);
    });
  });

  // ==================== readFileStream ====================

  describe('readFileStream', () => {
    it('should yield single chunk when file size is unknown', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('stat')) return ok('STAT_FAILED');
        if (cmd.includes('base64')) return ok('aGVsbG8='); // "hello"
        return ok();
      });

      const chunks: Uint8Array[] = [];
      for await (const chunk of adapter.readFileStream('/test.txt')) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });

    it('should yield chunks when file size is known', async () => {
      const adapter = createPolyfillAdapter((cmd) => {
        if (cmd.includes('stat'))
          return ok('100|1700000000|1700000000|644|user|group|regular file');
        if (cmd.includes('dd ') || cmd.includes('base64')) return ok('aGVsbG8=');
        return ok();
      });

      const chunks: Uint8Array[] = [];
      for await (const chunk of adapter.readFileStream('/test.txt')) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== writeFileStream ====================

  describe('writeFileStream', () => {
    it('should collect stream and write via writeFiles', async () => {
      const adapter = createPolyfillAdapter(() => ok());

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([72, 101]));
          controller.enqueue(new Uint8Array([108, 108, 111]));
          controller.close();
        }
      });

      await adapter.writeFileStream('/test.txt', stream);
    });
  });

  // ==================== MockSandboxAdapter specific ====================

  it('should stop MockSandboxAdapter', async () => {
    const adapter = new MockSandboxAdapter({ supportsPauseResume: false });
    await adapter.stop();
    expect(adapter.status.state).toBe('Stopped');
  });

  // ==================== normalizePath ====================

  describe('normalizePath', () => {
    describe('default rootPath = "/"', () => {
      let adapter: FallbackAdapter;
      beforeEach(() => {
        adapter = new FallbackAdapter();
      });

      it('should return rootPath for "."', () => {
        expect(adapter.normalizePath('.')).toBe('/');
      });

      it('should return rootPath for "./"', () => {
        expect(adapter.normalizePath('./')).toBe('/');
      });

      it('should return rootPath for undefined (default param)', () => {
        expect(adapter.normalizePath()).toBe('/');
      });

      it('should join rootPath with relative path', () => {
        expect(adapter.normalizePath('foo/bar')).toBe('/foo/bar');
      });

      it('should join rootPath with "./" prefixed path', () => {
        expect(adapter.normalizePath('./foo/bar')).toBe('/foo/bar');
      });

      it('should pass through absolute path unchanged', () => {
        expect(adapter.normalizePath('/absolute/path')).toBe('/absolute/path');
      });

      it('should pass through root "/" unchanged', () => {
        expect(adapter.normalizePath('/')).toBe('/');
      });
    });

    describe('custom rootPath = "/home/devbox"', () => {
      let adapter: CustomRootAdapter;
      beforeEach(() => {
        adapter = new CustomRootAdapter();
      });

      it('should return rootPath for "."', () => {
        expect(adapter.normalizePath('.')).toBe('/home/devbox');
      });

      it('should return rootPath for "./"', () => {
        expect(adapter.normalizePath('./')).toBe('/home/devbox');
      });

      it('should return rootPath with trailing slash for undefined (default param)', () => {
        expect(adapter.normalizePath()).toBe('/home/devbox/');
      });

      it('should join rootPath with relative path', () => {
        expect(adapter.normalizePath('project/src')).toBe('/home/devbox/project/src');
      });

      it('should join rootPath with "./" prefixed path', () => {
        expect(adapter.normalizePath('./project/src')).toBe('/home/devbox/project/src');
      });

      it('should pass through absolute path unchanged', () => {
        expect(adapter.normalizePath('/tmp/output.csv')).toBe('/tmp/output.csv');
      });
    });
  });
});
