import { BaseSandboxAdapter } from '@/adapters/BaseSandboxAdapter';
import { FeatureNotSupportedError } from '@/errors';
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
  ReadFileOptions,
  SandboxId,
  SandboxInfo,
  SandboxMetrics,
  SandboxStatus,
  SearchResult,
  StreamHandlers
} from '@/types';

export interface MockSandboxAdapterOptions {
  supportsPauseResume?: boolean;
  supportsRenewExpiration?: boolean;
}

/**
 * Mock adapter for testing the base class behavior.
 * Provides in-memory filesystem and command execution.
 */
export class MockSandboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'mock';

  _id: SandboxId = 'mock-sandbox-id';
  _status: SandboxStatus = { state: 'Running' };

  private supportsPauseResume: boolean;
  private supportsRenewExpiration: boolean;
  private sessionCounter = 0;

  // Storage for mock filesystem
  private files = new Map<string, Uint8Array>();
  private directories = new Set<string>();

  constructor(options: MockSandboxAdapterOptions = {}) {
    super();
    this.supportsPauseResume = options.supportsPauseResume ?? true;
    this.supportsRenewExpiration = options.supportsRenewExpiration ?? true;
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
  async ensureRunning(): Promise<void> {
    return this.create();
  }

  async create(): Promise<void> {
    this._status = { state: 'Running' };
  }

  async start(): Promise<void> {
    this._status = { state: 'Running' };
  }

  async stop(): Promise<void> {
    this._status = { state: 'Stopped' };
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    if (sandboxId) {
      this._id = sandboxId;
    }
    this._status = { state: 'UnExist' };
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

  async renewExpiration(_additionalSeconds: number): Promise<void> {
    if (!this.supportsRenewExpiration) {
      throw new FeatureNotSupportedError(
        'Renewal not supported by mock provider',
        'renewExpiration',
        this.provider
      );
    }
  }

  // ==================== Command Execution ====================

  async execute(command: string, _options?: ExecuteOptions): Promise<ExecuteResult> {
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

  async executeStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    if (handlers.onStdout) {
      await handlers.onStdout({ text: `Streamed: ${command}` });
    }
    if (handlers.onComplete) {
      await handlers.onComplete(await this.execute(command, options));
    }
  }

  async executeBackground(
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

  async interrupt(_sessionId: string): Promise<void> {
    // No-op
  }

  // ==================== Filesystem Operations ====================

  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    return paths.map((path) => {
      const content = this.files.get(path);
      if (content) {
        let sliced = content;
        if (options?.range) {
          const [startValue, endValue] = options.range.split('-');
          const start = Number.parseInt(startValue, 10);
          const end = endValue ? Number.parseInt(endValue, 10) : undefined;
          if (!Number.isNaN(start) && (endValue ? !Number.isNaN(end as number) : true)) {
            sliced = content.slice(start, end);
          }
        }
        return { path, content: sliced, error: null };
      }
      return {
        path,
        content: new Uint8Array(),
        error: new Error(`File not found: ${path}`)
      };
    });
  }

  async writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
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

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    return paths.map((path) => {
      const existed = this.files.has(path);
      this.files.delete(path);
      return { path, success: existed, error: null };
    });
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
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

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
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

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    for (const { source, destination } of entries) {
      const content = this.files.get(source);
      if (content) {
        this.files.set(destination, content);
        this.files.delete(source);
      }
    }
  }

  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    for (const { path, oldContent, newContent } of entries) {
      const content = this.files.get(path);
      if (content) {
        const text = new TextDecoder().decode(content);
        const replaced = text.replace(new RegExp(oldContent, 'g'), newContent);
        this.files.set(path, new TextEncoder().encode(replaced));
      }
    }
  }

  async createDirectories(
    paths: string[],
    _options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    for (const path of paths) {
      this.directories.add(path);
    }
  }

  async deleteDirectories(
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

  async setPermissions(_entries: PermissionEntry[]): Promise<void> {
    // No-op in mock
  }

  async search(pattern: string, path?: string): Promise<SearchResult[]> {
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

  // ==================== Health Check ====================

  async ping(): Promise<boolean> {
    return true;
  }

  async getMetrics(): Promise<SandboxMetrics> {
    return {
      cpuCount: 2,
      cpuUsedPercentage: 10,
      memoryTotalMiB: 4096,
      memoryUsedMiB: 1024,
      timestamp: Date.now()
    };
  }
}
