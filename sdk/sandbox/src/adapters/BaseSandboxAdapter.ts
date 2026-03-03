import { FeatureNotSupportedError, SandboxReadyTimeoutError } from '../errors';
import type { ISandbox } from '../interfaces/ISandbox';
import { CapabilityDetector, CommandPolyfillService } from '../polyfill';
import type {
  ContentReplaceEntry,
  DirectoryEntry,
  ExecuteOptions,
  ExecuteResult,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteEntry,
  FileWriteResult,
  MoveEntry,
  PermissionEntry,
  ProviderCapabilities,
  ReadFileOptions,
  SandboxConfig,
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
 * Implements the Template Method pattern for capability-aware operations.
 * Subclasses implement native methods, and this base class automatically
n * routes to polyfills when native capabilities are unavailable.
 *
 * Following the Open/Closed Principle: new providers are added by
 * extending this class, not modifying it.
 */
export abstract class BaseSandboxAdapter implements ISandbox {
  abstract readonly id: SandboxId;
  abstract readonly provider: string;
  abstract readonly capabilities: ProviderCapabilities;

  protected _status: SandboxStatus = { state: 'Creating' };
  protected polyfillService?: CommandPolyfillService;
  protected capabilityDetector: CapabilityDetector;

  constructor() {
    // Will be initialized by subclasses with their capabilities
    this.capabilityDetector = new CapabilityDetector(this.getCapabilitiesForDetector());
  }

  /**
   * Get capabilities for the detector (called during construction).
   * Subclasses should override capabilities property.
   */
  protected getCapabilitiesForDetector(): ProviderCapabilities {
    return this.capabilities;
  }

  /**
   * Initialize the polyfill service if needed.
   * Called by subclasses after setting up command execution.
   */
  protected initializePolyfillService(executor: ISandbox): void {
    if (
      !(
        this.capabilities.nativeFileSystem &&
        this.capabilities.nativeHealthCheck &&
        this.capabilities.nativeMetrics &&
        this.capabilities.supportsSearch
      )
    ) {
      this.polyfillService = new CommandPolyfillService(executor);
    }
  }

  get status(): SandboxStatus {
    return this._status;
  }

  // ==================== Abstract Native Methods ====================
  // Subclasses MUST implement these

  abstract create(config: SandboxConfig): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract resume(): Promise<void>;
  abstract delete(): Promise<void>;
  abstract getInfo(): Promise<SandboxInfo>;
  abstract close(): Promise<void>;

  /**
   * Native command execution - subclasses must implement.
   */
  protected abstract nativeExecute(
    command: string,
    options?: ExecuteOptions
  ): Promise<ExecuteResult>;

  /**
   * Native file read - implement if nativeFileSystem is true.
   */
  protected abstract nativeReadFiles(
    paths: string[],
    options?: ReadFileOptions
  ): Promise<FileReadResult[]>;

  /**
   * Native file write - implement if nativeFileSystem is true.
   */
  protected abstract nativeWriteFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]>;

  /**
   * Native file delete - implement if nativeFileSystem is true.
   */
  protected abstract nativeDeleteFiles(paths: string[]): Promise<FileDeleteResult[]>;

  /**
   * Native directory list - implement if nativeFileSystem is true.
   */
  protected abstract nativeListDirectory(path: string): Promise<DirectoryEntry[]>;

  /**
   * Native file info - implement if nativeFileSystem is true.
   */
  protected abstract nativeGetFileInfo(paths: string[]): Promise<Map<string, FileInfo>>;

  /**
   * Native health check - implement if nativeHealthCheck is true.
   */
  protected abstract nativePing(): Promise<boolean>;

  /**
   * Native metrics - implement if nativeMetrics is true.
   */
  protected abstract nativeGetMetrics(): Promise<SandboxMetrics>;

  // ==================== Template Methods (Capability Routing) ====================

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

    throw new SandboxReadyTimeoutError(this.id, timeoutMs);
  }

  async renewExpiration(additionalSeconds: number): Promise<void> {
    if (!this.capabilities.supportsRenews) {
      throw new FeatureNotSupportedError(
        'Sandbox expiration renewal not supported by this provider',
        'renewExpiration',
        this.provider
      );
    }
    await this.nativeRenewExpiration(additionalSeconds);
  }

  protected abstract nativeRenewExpiration(additionalSeconds: number): Promise<void>;

  // ==================== ICommandExecution Implementation ====================

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    return this.nativeExecute(command, options);
  }

  async executeStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    if (!this.capabilities.supportsStreamingOutput) {
      // Fallback: execute normally and call handlers
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
      return;
    }

    await this.nativeExecuteStream(command, handlers, options);
  }

  protected abstract nativeExecuteStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void>;

  async executeBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    if (!this.capabilities.supportsBackgroundExecution) {
      throw new FeatureNotSupportedError(
        'Background execution not supported by this provider',
        'executeBackground',
        this.provider
      );
    }
    return this.nativeExecuteBackground(command, options);
  }

  protected abstract nativeExecuteBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }>;

  async interrupt(sessionId: string): Promise<void> {
    if (!this.capabilities.supportsBackgroundExecution) {
      throw new FeatureNotSupportedError(
        'Command interruption not supported by this provider',
        'interrupt',
        this.provider
      );
    }
    return this.nativeInterrupt(sessionId);
  }

  protected abstract nativeInterrupt(sessionId: string): Promise<void>;

  // ==================== IFileSystem Implementation (with Polyfill Routing) ====================

  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeReadFiles(paths, options);
    }

    // Use polyfill
    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File read not supported and no polyfill available',
        'readFiles',
        this.provider
      );
    }

    // Batch via polyfill
    const results: FileReadResult[] = [];
    for (const path of paths) {
      try {
        const content = await this.polyfillService.readFile(path);
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
    if (this.capabilities.nativeFileSystem) {
      return this.nativeWriteFiles(entries);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File write not supported and no polyfill available',
        'writeFiles',
        this.provider
      );
    }

    const results: FileWriteResult[] = [];
    for (const entry of entries) {
      try {
        let bytesWritten: number;

        if (typeof entry.data === 'string') {
          bytesWritten = await this.polyfillService.writeTextFile(entry.path, entry.data);
        } else if (entry.data instanceof Uint8Array) {
          bytesWritten = await this.polyfillService.writeFile(entry.path, entry.data);
        } else if (entry.data instanceof ArrayBuffer) {
          bytesWritten = await this.polyfillService.writeFile(
            entry.path,
            new Uint8Array(entry.data)
          );
        } else if (entry.data instanceof Blob) {
          const arrayBuffer = await entry.data.arrayBuffer();
          bytesWritten = await this.polyfillService.writeFile(
            entry.path,
            new Uint8Array(arrayBuffer)
          );
        } else {
          // ReadableStream
          const chunks: Uint8Array[] = [];
          const reader = entry.data.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            chunks.push(value);
          }
          const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          bytesWritten = await this.polyfillService.writeFile(entry.path, combined);
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
    if (this.capabilities.nativeFileSystem) {
      return this.nativeDeleteFiles(paths);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File delete not supported and no polyfill available',
        'deleteFiles',
        this.provider
      );
    }

    const polyfillResults = await this.polyfillService.deleteFiles(paths);
    return polyfillResults.map((r) => ({
      path: r.path,
      success: r.success,
      error: r.error || null
    }));
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeMoveFiles(entries);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File move not supported and no polyfill available',
        'moveFiles',
        this.provider
      );
    }

    await this.polyfillService.moveFiles(
      entries.map((e) => ({ source: e.source, destination: e.destination }))
    );
  }

  protected abstract nativeMoveFiles(entries: MoveEntry[]): Promise<void>;

  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeReplaceContent(entries);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'Content replace not supported and no polyfill available',
        'replaceContent',
        this.provider
      );
    }

    await this.polyfillService.replaceContent(entries);
  }

  protected abstract nativeReplaceContent(entries: ContentReplaceEntry[]): Promise<void>;

  // ==================== Directory Operations ====================

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeCreateDirectories(paths, options);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'Directory creation not supported and no polyfill available',
        'createDirectories',
        this.provider
      );
    }

    await this.polyfillService.createDirectories(paths, options);
  }

  protected abstract nativeCreateDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void>;

  async deleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeDeleteDirectories(paths, options);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'Directory deletion not supported and no polyfill available',
        'deleteDirectories',
        this.provider
      );
    }

    await this.polyfillService.deleteDirectories(paths, options);
  }

  protected abstract nativeDeleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void>;

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeListDirectory(path);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'Directory listing not supported and no polyfill available',
        'listDirectory',
        this.provider
      );
    }

    return this.polyfillService.listDirectory(path);
  }

  // ==================== Streaming Operations ====================

  readFileStream(path: string): AsyncIterable<Uint8Array> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        if (!self.capabilities.supportsStreamingTransfer) {
          // Fallback: read entire file then stream it
          const result = await self.readFiles([path]);
          const fileResult = result[0];
          if (!fileResult) {
            throw new Error('No file result returned');
          }
          if (fileResult.error) {
            throw fileResult.error;
          }
          yield fileResult.content;
          return;
        }

        const iterable = self.nativeReadFileStream(path);
        for await (const chunk of iterable) {
          yield chunk;
        }
      }
    };
  }

  protected abstract nativeReadFileStream(path: string): AsyncIterable<Uint8Array>;

  async writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    if (!this.capabilities.supportsStreamingTransfer) {
      // Fallback: collect stream then write
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      await this.writeFiles([{ path, data: combined }]);
      return;
    }

    await this.nativeWriteFileStream(path, stream);
  }

  protected abstract nativeWriteFileStream(
    path: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<void>;

  // ==================== Metadata Operations ====================

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    if (this.capabilities.nativeFileSystem) {
      return this.nativeGetFileInfo(paths);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File info not supported and no polyfill available',
        'getFileInfo',
        this.provider
      );
    }

    return this.polyfillService.getFileInfo(paths);
  }

  async setPermissions(entries: PermissionEntry[]): Promise<void> {
    if (!this.capabilities.supportsPermissions) {
      // Try polyfill
      if (!this.polyfillService) {
        throw new FeatureNotSupportedError(
          'Permission setting not supported and no polyfill available',
          'setPermissions',
          this.provider
        );
      }
      await this.polyfillService.setPermissions(entries);
      return;
    }

    await this.nativeSetPermissions(entries);
  }

  protected abstract nativeSetPermissions(entries: PermissionEntry[]): Promise<void>;

  // ==================== Search Operations ====================

  async search(pattern: string, path?: string): Promise<SearchResult[]> {
    if (this.capabilities.supportsSearch) {
      return this.nativeSearch(pattern, path);
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'File search not supported and no polyfill available',
        'search',
        this.provider
      );
    }

    return this.polyfillService.search(pattern, path);
  }

  protected abstract nativeSearch(pattern: string, path?: string): Promise<SearchResult[]>;

  // ==================== IHealthCheck Implementation ====================

  async ping(): Promise<boolean> {
    if (this.capabilities.nativeHealthCheck) {
      return this.nativePing();
    }

    if (!this.polyfillService) {
      // Fallback: try to execute a simple command
      try {
        const result = await this.execute('echo PING');
        return result.exitCode === 0;
      } catch {
        return false;
      }
    }

    return this.polyfillService.ping();
  }

  async getMetrics(): Promise<SandboxMetrics> {
    if (this.capabilities.nativeMetrics) {
      return this.nativeGetMetrics();
    }

    if (!this.polyfillService) {
      throw new FeatureNotSupportedError(
        'Metrics not supported and no polyfill available',
        'getMetrics',
        this.provider
      );
    }

    return this.polyfillService.getMetrics();
  }

  // ==================== Utility Methods ====================

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
