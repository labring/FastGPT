import { BaseSandboxAdapter } from '../../src/adapters/BaseSandboxAdapter';
import { FeatureNotSupportedError } from '../../src/errors';
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
} from '../../src/types';
import { createFullCapabilities } from '../../src/types';

/**
 * Mock adapter for testing the base class behavior.
 * Uses full capabilities by default.
 */
export class MockSandboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'mock';
  readonly capabilities: ProviderCapabilities;

  _id: SandboxId = 'mock-sandbox-id';
  _status: SandboxStatus = { state: 'Running' };

  // Storage for mock filesystem
  private files = new Map<string, Uint8Array>();
  private directories = new Set<string>();

  constructor(capabilities: ProviderCapabilities = createFullCapabilities()) {
    super();
    this.capabilities = capabilities;

    // Initialize polyfill if needed
    if (!capabilities.nativeFileSystem) {
      this.initializePolyfillService(this);
    }
  }

  get id(): SandboxId {
    return this._id;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  // Mock control methods
  setFile(path: string, content: Uint8Array | string): void {
    this.files.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  getFile(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }

  clearFiles(): void {
    this.files.clear();
    this.directories.clear();
  }

  // Lifecycle methods (stubs)
  async create(_config: SandboxConfig): Promise<void> {
    this._status = { state: 'Running' };
  }

  async start(): Promise<void> {
    this._status = { state: 'Running' };
  }

  async stop(): Promise<void> {
    this._status = { state: 'Deleted' };
  }

  async pause(): Promise<void> {
    if (!this.capabilities.supportsPauseResume) {
      throw new FeatureNotSupportedError(
        'Pause not supported by mock provider',
        'pause',
        this.provider
      );
    }
    this._status = { state: 'Paused' };
  }

  async resume(): Promise<void> {
    if (!this.capabilities.supportsPauseResume) {
      throw new FeatureNotSupportedError(
        'Resume not supported by mock provider',
        'resume',
        this.provider
      );
    }
    this._status = { state: 'Running' };
  }

  async delete(): Promise<void> {
    this._status = { state: 'Deleted' };
  }

  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this._id,
      image: { repository: 'mock', tag: 'latest' },
      entrypoint: [],
      status: this._status,
      createdAt: new Date()
    };
  }

  async close(): Promise<void> {
    // No-op
  }

  protected async nativeRenewExpiration(_additionalSeconds: number): Promise<void> {
    // No-op
  }

  // Command execution (native)
  private sessionCounter = 0;

  protected async nativeExecute(
    command: string,
    _options?: ExecuteOptions
  ): Promise<ExecuteResult> {
    // Handle specific commands for polyfill tests
    if (command.includes('nproc')) {
      return { stdout: '2', stderr: '', exitCode: 0, truncated: false };
    }
    if (command.includes('/proc/meminfo')) {
      const stdout = 'MemTotal: 4096000 kB\nMemFree: 2048000 kB\nMemAvailable: 3072000 kB';
      return { stdout, stderr: '', exitCode: 0, truncated: false };
    }
    if (command.includes('echo "PING"')) {
      return { stdout: 'PING', stderr: '', exitCode: 0, truncated: false };
    }
    // Make cat write commands fail (cat with > or <<)
    if (command.includes('cat ') && (command.includes('>') || command.includes('<<'))) {
      return { stdout: '', stderr: 'mock: write not implemented', exitCode: 1, truncated: false };
    }
    // Default success for other commands
    return {
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0,
      truncated: false
    };
  }

  protected async nativeExecuteStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    if (handlers.onStdout) {
      await handlers.onStdout({ text: `Streamed: ${command}` });
    }
    if (handlers.onComplete) {
      await handlers.onComplete(await this.nativeExecute(command, options));
    }
  }

  protected async nativeExecuteBackground(
    _command: string,
    _options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    const sessionId = `mock-session-${++this.sessionCounter}`;
    return {
      sessionId,
      kill: async () => {
        // No-op
      }
    };
  }

  protected async nativeInterrupt(_sessionId: string): Promise<void> {
    // No-op
  }

  // Filesystem (native when capabilities allow)
  protected async nativeReadFiles(
    paths: string[],
    _options?: ReadFileOptions
  ): Promise<FileReadResult[]> {
    return paths.map((path) => {
      const content = this.files.get(path);
      if (content) {
        return { path, content, error: null };
      }
      return {
        path,
        content: new Uint8Array(),
        error: new Error(`File not found: ${path}`)
      };
    });
  }

  protected async nativeWriteFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    return entries.map((entry) => {
      try {
        let data: Uint8Array;
        if (typeof entry.data === 'string') {
          data = new TextEncoder().encode(entry.data);
        } else if (entry.data instanceof Uint8Array) {
          data = entry.data;
        } else if (entry.data instanceof ArrayBuffer) {
          data = new Uint8Array(entry.data);
        } else {
          throw new Error('Stream/Blob not supported in mock');
        }

        this.files.set(entry.path, data);
        return { path: entry.path, bytesWritten: data.length, error: null };
      } catch (error) {
        return {
          path: entry.path,
          bytesWritten: 0,
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    });
  }

  protected async nativeDeleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    return paths.map((path) => {
      const existed = this.files.has(path);
      this.files.delete(path);
      return { path, success: existed, error: null };
    });
  }

  protected async nativeListDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = [];
    const seen = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(`${path}/`) || filePath.startsWith(path)) {
        const relativePath = filePath.slice(path.length).replace(/^\//, '');
        const name = relativePath.split('/')[0];
        if (!seen.has(name)) {
          seen.add(name);
          const isDir = relativePath.includes('/');
          entries.push({
            name,
            path: `${path}/${name}`,
            isDirectory: isDir,
            isFile: !isDir
          });
        }
      }
    }

    return entries;
  }

  protected async nativeGetFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const info = new Map<string, FileInfo>();
    for (const path of paths) {
      const content = this.files.get(path);
      if (content) {
        info.set(path, {
          path,
          size: content.length,
          isFile: true,
          isDirectory: false
        });
      }
    }
    return info;
  }

  protected async nativeMoveFiles(entries: MoveEntry[]): Promise<void> {
    for (const { source, destination } of entries) {
      const content = this.files.get(source);
      if (content) {
        this.files.set(destination, content);
        this.files.delete(source);
      }
    }
  }

  protected async nativeReplaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    for (const { path, oldContent, newContent } of entries) {
      const content = this.files.get(path);
      if (content) {
        const text = new TextDecoder().decode(content);
        const replaced = text.replace(new RegExp(oldContent, 'g'), newContent);
        this.files.set(path, new TextEncoder().encode(replaced));
      }
    }
  }

  protected async nativeCreateDirectories(
    paths: string[],
    _options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    for (const path of paths) {
      this.directories.add(path);
    }
  }

  protected async nativeDeleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    for (const path of paths) {
      this.directories.delete(path);
      if (options?.recursive) {
        for (const filePath of this.files.keys()) {
          if (filePath.startsWith(`${path}/`)) {
            this.files.delete(filePath);
          }
        }
      }
    }
  }

  protected nativeReadFileStream(path: string): AsyncIterable<Uint8Array> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return {
      [Symbol.asyncIterator]: async function* () {
        yield content;
      }
    };
  }

  protected async nativeWriteFileStream(
    path: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<void> {
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
    this.files.set(path, combined);
  }

  protected async nativeSetPermissions(_entries: PermissionEntry[]): Promise<void> {
    // No-op in mock
  }

  protected async nativeSearch(pattern: string, path?: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const filePath of this.files.keys()) {
      if (!path || filePath.startsWith(path)) {
        const basename = filePath.split('/').pop() || '';
        if (regex.test(basename)) {
          results.push({ path: filePath, isFile: true });
        }
      }
    }
    return results;
  }

  // Health check (native)
  protected async nativePing(): Promise<boolean> {
    return true;
  }

  protected async nativeGetMetrics(): Promise<SandboxMetrics> {
    return {
      cpuCount: 2,
      cpuUsedPercentage: 10,
      memoryTotalMiB: 4096,
      memoryUsedMiB: 1024,
      timestamp: Date.now()
    };
  }
}
