import { FeatureNotSupportedError, SandboxReadyTimeoutError } from '../errors';
import type { ISandbox } from '../interfaces/ISandbox';
import type { CommandPolyfillService } from '../polyfill/CommandPolyfillService';
import type {
  ContentReplaceEntry,
  DirectoryEntry,
  Endpoint,
  ExecuteOptions,
  ExecuteResult,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteEntry,
  FileWriteResult,
  MoveEntry,
  PermissionEntry,
  ReadFileOptions,
  SandboxEndpointSelector,
  SandboxId,
  SandboxInfo,
  SandboxMetrics,
  SandboxStatus,
  SearchResult,
  StreamHandlers
} from '../types';

/**
 * Abstract base class for all sandbox adapters.
 *
 * Provides default polyfilled implementations for common filesystem,
 * search, health, and metrics operations via CommandPolyfillService.
 * Subclasses can override the polyfill service in their constructor.
 */
export abstract class BaseSandboxAdapter implements ISandbox {
  abstract readonly id?: SandboxId;
  abstract readonly provider: string;

  protected _status: SandboxStatus = { state: 'Creating' };
  protected polyfillService?: CommandPolyfillService;

  constructor() {}

  /**
   * The root path of the sandbox filesystem.
   * Subclasses should override this to return the provider-specific root path.
   */
  get rootPath(): string {
    return '/';
  }

  /**
   * Normalize a path relative to rootPath.
   * - '.' or './' → rootPath
   * - './foo' → rootPath/foo
   * - 'foo' → rootPath/foo
   * - '/absolute' → '/absolute' (pass through)
   */
  protected normalizePath(path: string = ''): string {
    if (path === '.' || path === './') return this.rootPath;
    const root = this.rootPath.replace(/\/+$/, '');
    if (path.startsWith('./')) return `${root}/${path.slice(2)}`;
    if (!path.startsWith('/')) return `${root}/${path}`;
    return path;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  // ==================== Lifecycle Methods ====================

  abstract ensureRunning(): Promise<void>;
  abstract create(): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract delete(sandboxId?: SandboxId): Promise<void>;
  abstract getInfo(): Promise<SandboxInfo | null>;

  async waitUntilReady(timeoutMs: number = 120000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      const isReady = await this.ping();
      if (isReady) {
        return;
      }
      await this.sleep(checkInterval);
    }

    throw new SandboxReadyTimeoutError(this.id ?? 'Unknown', timeoutMs);
  }
  async waitUntilDeleted(timeoutMs: number = 120000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      const data = await this.getInfo().catch(() => true);
      if (!data) {
        return;
      }
      await this.sleep(checkInterval);
    }

    throw new SandboxReadyTimeoutError(this.id ?? 'Unknown', timeoutMs);
  }

  async renewExpiration(_additionalSeconds: number): Promise<void> {
    throw new FeatureNotSupportedError(
      'Sandbox expiration renewal not supported by this provider',
      'renewExpiration',
      this.provider
    );
  }

  async getEndpoint(_selector: SandboxEndpointSelector): Promise<Endpoint> {
    throw new FeatureNotSupportedError(
      'Endpoint resolution not supported by this provider',
      'getEndpoint',
      this.provider
    );
  }

  // ==================== ICommandExecution Implementation ====================

  abstract execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  async executeStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    const result = await this.execute(command, options);

    if (handlers.onStdout && result.stdout) {
      await handlers.onStdout({ text: result.stdout });
    }
    if (handlers.onStderr && result.stderr) {
      await handlers.onStderr({ text: result.stderr });
    }
    if (handlers.onComplete) {
      await handlers.onComplete(result);
    }
  }

  async executeBackground(
    _command: string,
    _options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    throw new FeatureNotSupportedError(
      'Background execution not supported by this provider',
      'executeBackground',
      this.provider
    );
  }

  async interrupt(_sessionId: string): Promise<void> {
    throw new FeatureNotSupportedError(
      'Command interruption not supported by this provider',
      'interrupt',
      this.provider
    );
  }

  // ==================== IFileSystem Implementation (Polyfill) ====================

  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    const polyfillService = this.requirePolyfillService(
      'readFiles',
      'File read not supported by this provider'
    );

    const results: FileReadResult[] = [];
    for (const path of paths.map((p) => this.normalizePath(p))) {
      try {
        let content: Uint8Array;
        if (options?.range) {
          const [startValue, endValue] = options.range.split('-');
          const start = Number.parseInt(startValue, 10);
          const end = endValue ? Number.parseInt(endValue, 10) : undefined;
          if (Number.isNaN(start) || (endValue && Number.isNaN(end as number))) {
            throw new Error(`Invalid range: ${options.range}`);
          }
          content = await polyfillService.readFileRange(path, start, end);
        } else {
          content = await polyfillService.readFile(path);
        }
        results.push({ path, content, error: null });
      } catch (error) {
        results.push({
          path,
          content: new Uint8Array(),
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  async writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    const polyfillService = this.requirePolyfillService(
      'writeFiles',
      'File write not supported by this provider'
    );

    const results: FileWriteResult[] = [];
    for (const entry of entries.map((e) => ({ ...e, path: this.normalizePath(e.path) }))) {
      try {
        let bytesWritten: number;

        if (typeof entry.data === 'string') {
          bytesWritten = await polyfillService.writeTextFile(entry.path, entry.data);
        } else if (entry.data instanceof Uint8Array) {
          bytesWritten = await polyfillService.writeFile(entry.path, entry.data);
        } else if (entry.data instanceof ArrayBuffer) {
          bytesWritten = await polyfillService.writeFile(entry.path, new Uint8Array(entry.data));
        } else if (entry.data instanceof Blob) {
          const arrayBuffer = await entry.data.arrayBuffer();
          bytesWritten = await polyfillService.writeFile(entry.path, new Uint8Array(arrayBuffer));
        } else {
          // ReadableStream — append chunk-by-chunk so we never buffer the
          // full stream in memory.
          bytesWritten = await this.writeStreamToFile(polyfillService, entry.path, entry.data);
        }

        results.push({ path: entry.path, bytesWritten, error: null });
      } catch (error) {
        results.push({
          path: entry.path,
          bytesWritten: 0,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    const polyfillService = this.requirePolyfillService(
      'deleteFiles',
      'File delete not supported by this provider'
    );

    const polyfillResults = await polyfillService.deleteFiles(
      paths.map((p) => this.normalizePath(p))
    );
    return polyfillResults.map((r) => ({
      path: r.path,
      success: r.success,
      error: r.error || null
    }));
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'moveFiles',
      'File move not supported by this provider'
    );

    await polyfillService.moveFiles(
      entries.map((e) => ({
        source: this.normalizePath(e.source),
        destination: this.normalizePath(e.destination)
      }))
    );
  }

  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'replaceContent',
      'Content replace not supported by this provider'
    );

    await polyfillService.replaceContent(entries);
  }

  // ==================== Directory Operations ====================

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'createDirectories',
      'Directory creation not supported by this provider'
    );

    await polyfillService.createDirectories(
      paths.map((p) => this.normalizePath(p)),
      options
    );
  }

  async deleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'deleteDirectories',
      'Directory deletion not supported by this provider'
    );

    await polyfillService.deleteDirectories(
      paths.map((p) => this.normalizePath(p)),
      options
    );
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const polyfillService = this.requirePolyfillService(
      'listDirectory',
      'Directory listing not supported by this provider'
    );

    return polyfillService.listDirectory(this.normalizePath(path));
  }

  // ==================== Streaming Operations ====================

  async *readFileStream(path: string): AsyncIterable<Uint8Array> {
    this.requirePolyfillService(
      'readFileStream',
      'File stream read not supported by this provider'
    );

    const readChunk = async (range?: string): Promise<Uint8Array> => {
      const results = await this.readFiles([path], range ? { range } : undefined);
      const fileResult = results[0];
      if (!fileResult) {
        throw new Error('No file result returned');
      }
      if (fileResult.error) {
        throw fileResult.error;
      }
      return fileResult.content;
    };

    let size: number | undefined;
    try {
      const infoMap = await this.getFileInfo([path]);
      size = infoMap.get(path)?.size;
    } catch {
      // ignore to allow fallback read
    }

    if (typeof size !== 'number') {
      yield await readChunk();
      return;
    }

    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, size);
      const content = await readChunk(`${offset}-${end}`);
      yield content;
    }
  }

  async writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'writeFileStream',
      'File stream write not supported by this provider'
    );
    await this.writeStreamToFile(polyfillService, this.normalizePath(path), stream);
  }

  /**
   * Stream a ReadableStream into a file via a temporary file that is
   * atomically renamed on success. If the stream fails mid-write, the
   * original file is left untouched and the temp file is cleaned up.
   */
  private async writeStreamToFile(
    polyfillService: CommandPolyfillService,
    path: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<number> {
    const tmpPath = `${path}.tmp.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const reader = stream.getReader();
    let totalBytes = 0;
    let first = true;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;

        await polyfillService.appendBytes(tmpPath, value, first ? { truncate: true } : undefined);
        totalBytes += value.length;
        first = false;
      }

      // Ensure the file exists even if the stream yielded nothing.
      if (first) {
        await polyfillService.appendBytes(tmpPath, new Uint8Array(), { truncate: true });
      }

      // Atomic rename — same directory guarantees same filesystem.
      await polyfillService.moveFiles([{ source: tmpPath, destination: path }]);
    } catch (error) {
      // Best-effort cleanup of the temp file.
      await polyfillService.deleteFiles([tmpPath]).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    return totalBytes;
  }

  // ==================== Metadata Operations ====================

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const polyfillService = this.requirePolyfillService(
      'getFileInfo',
      'File info not supported by this provider'
    );

    return polyfillService.getFileInfo(paths.map((p) => this.normalizePath(p)));
  }

  async setPermissions(entries: PermissionEntry[]): Promise<void> {
    const polyfillService = this.requirePolyfillService(
      'setPermissions',
      'Permission setting not supported by this provider'
    );

    await polyfillService.setPermissions(entries);
  }

  // ==================== Search Operations ====================

  async search(pattern: string, path?: string): Promise<SearchResult[]> {
    const polyfillService = this.requirePolyfillService(
      'search',
      'File search not supported by this provider'
    );

    return polyfillService.search(pattern, path !== undefined ? this.normalizePath(path) : path);
  }

  // ==================== IHealthCheck Implementation ====================

  async ping(): Promise<boolean> {
    const polyfillService = this.requirePolyfillService(
      'ping',
      'Health check not supported by this provider'
    );

    return polyfillService.ping();
  }

  async getMetrics(): Promise<SandboxMetrics> {
    const polyfillService = this.requirePolyfillService(
      'getMetrics',
      'Metrics not supported by this provider'
    );

    return polyfillService.getMetrics();
  }

  // ==================== Utility Methods ====================

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected requirePolyfillService(feature: string, message: string): CommandPolyfillService {
    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(message, feature, this.provider);
    }
    return this.polyfillService;
  }

  protected escapeShellArg(arg: string): string {
    // Replace single quotes with '\'' (end quote, escaped quote, start quote)
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  protected buildCommand(command: string, workingDirectory?: string): string[] {
    if (workingDirectory) {
      // Escape the working directory path
      const escapedDir = this.escapeShellArg(workingDirectory);

      // Build: sh -lc 'cd '\''escaped/path'\'' && original command'
      return ['sh', '-lc', `cd ${escapedDir} && ${command}`];
    }

    // Just escape the command
    return ['sh', '-lc', command];
  }
}
