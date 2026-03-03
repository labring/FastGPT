import { FeatureNotSupportedError, FileOperationError } from '../errors';
import {
  type ContentReplaceEntry,
  createMinimalCapabilities,
  type DirectoryEntry,
  type ExecuteOptions,
  type ExecuteResult,
  type FileDeleteResult,
  type FileInfo,
  type FileReadResult,
  type FileWriteEntry,
  type FileWriteResult,
  type MoveEntry,
  type PermissionEntry,
  type ProviderCapabilities,
  type ReadFileOptions,
  type SandboxConfig,
  type SandboxId,
  type SandboxInfo,
  type SandboxMetrics,
  type SandboxStatus,
  type SearchResult,
  type StreamHandlers
} from '../types';
import { BaseSandboxAdapter } from './BaseSandboxAdapter';

/**
 * Connection interface for minimal providers.
 * Represents a provider that only supports basic command execution.
 */
export interface MinimalProviderConnection {
  /** Unique identifier for the sandbox */
  id: string;

  /** Execute a command and return result */
  execute(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;

  /** Get current status */
  getStatus(): Promise<SandboxStatus>;

  /** Close the connection */
  close(): Promise<void>;
}

/**
 * Minimal provider adapter.
 *
 * This demonstrates how to adapt a provider with minimal capabilities
 * (only command execution) to the full ISandbox interface using
 * the CommandPolyfillService.
 *
 * Use case: Legacy SSH-based sandboxes, custom container providers,
 * or any provider that only exposes a shell interface.
 */
export class MinimalProviderAdapter extends BaseSandboxAdapter {
  readonly provider = 'minimal';
  readonly capabilities: ProviderCapabilities = createMinimalCapabilities();

  private _id: SandboxId = '';
  private _status: SandboxStatus = { state: 'Creating' };
  private connection?: MinimalProviderConnection;

  constructor(private connectionFactory?: () => Promise<MinimalProviderConnection>) {
    super();
  }

  get id(): SandboxId {
    return this._id;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  // ==================== Lifecycle Methods ====================

  async create(config: SandboxConfig): Promise<void> {
    // Minimal provider assumes sandbox is created externally
    // This would typically involve calling an API to create the sandbox
    if (this.connectionFactory) {
      this.connection = await this.connectionFactory();
      this._id = this.connection.id;
      this._status = { state: 'Running' };

      // Initialize polyfill service for all filesystem operations
      this.initializePolyfillService(this);

      // Run any setup commands from config
      if (config.entrypoint && config.entrypoint.length > 0) {
        await this.execute(config.entrypoint.join(' '));
      }
    } else {
      throw new Error('Connection factory not provided');
    }
  }

  async connect(connection: MinimalProviderConnection): Promise<void> {
    this.connection = connection;
    this._id = connection.id;
    this._status = await connection.getStatus();
    this.initializePolyfillService(this);
  }

  async start(): Promise<void> {
    // No-op: minimal provider doesn't support explicit start
    this._status = { state: 'Running' };
  }

  async stop(): Promise<void> {
    // Execute shutdown command
    await this.execute('exit 0').catch(() => {
      // Expected to fail as connection closes
    });
    this._status = { state: 'Deleted' };
  }

  async pause(): Promise<void> {
    throw new FeatureNotSupportedError(
      'Pause not supported by minimal provider',
      'pause',
      this.provider
    );
  }

  async resume(): Promise<void> {
    throw new FeatureNotSupportedError(
      'Resume not supported by minimal provider',
      'resume',
      this.provider
    );
  }

  async delete(): Promise<void> {
    await this.stop();
    await this.connection?.close();
  }

  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this._id,
      image: { repository: 'minimal', tag: 'latest' },
      entrypoint: [],
      status: this._status,
      createdAt: new Date()
    };
  }

  async close(): Promise<void> {
    await this.connection?.close();
  }

  protected async nativeRenewExpiration(_additionalSeconds: number): Promise<void> {
    throw new FeatureNotSupportedError(
      'Renewal not supported by minimal provider',
      'renewExpiration',
      this.provider
    );
  }

  // ==================== Command Execution (Native) ====================

  protected async nativeExecute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.connection) {
      throw new Error('Not connected to minimal provider');
    }

    // Handle working directory option
    let finalCommand = command;
    if (options?.workingDirectory) {
      finalCommand = `cd "${options.workingDirectory}" && ${command}`;
    }

    // Handle timeout via timeout command
    if (options?.timeoutMs && options.timeoutMs > 0) {
      const timeoutSec = Math.ceil(options.timeoutMs / 1000);
      finalCommand = `timeout ${timeoutSec} sh -c '${finalCommand.replace(/'/g, "'\"'\"'")}'`;
    }

    // Handle environment variables
    if (options?.env && Object.keys(options.env).length > 0) {
      const envVars = Object.entries(options.env)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '"')}"`)
        .join(' ');
      finalCommand = `export ${envVars} && ${finalCommand}`;
    }

    const result = await this.connection.execute(finalCommand);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  }

  protected async nativeExecuteStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    // Minimal provider doesn't support true streaming
    // Simulate by executing and calling handlers
    const result = await this.nativeExecute(command, options);

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

  protected async nativeExecuteBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    // Simulate background execution with nohup
    const sessionId = `bg-${Date.now()}`;

    let finalCommand = command;
    if (options?.workingDirectory) {
      finalCommand = `cd "${options.workingDirectory}" && ${command}`;
    }

    // Start process in background
    await this.nativeExecute(
      `nohup sh -c '${finalCommand.replace(
        /'/g,
        "'\"'\"'"
      )}' > /tmp/${sessionId}.out 2>&1 & echo $!`,
      options
    );

    return {
      sessionId,
      kill: async () => {
        await this.nativeExecute(`pkill -f "${sessionId}" || true`);
      }
    };
  }

  protected async nativeInterrupt(_sessionId: string): Promise<void> {
    // Kill all background processes
    await this.nativeExecute('pkill -f "nohup" || true');
  }

  // ==================== File System Operations (All Polyfilled) ====================

  protected async nativeReadFiles(
    _paths: string[],
    _options?: ReadFileOptions
  ): Promise<FileReadResult[]> {
    // This should never be called - polyfill is always used
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeWriteFiles(_entries: FileWriteEntry[]): Promise<FileWriteResult[]> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeDeleteFiles(_paths: string[]): Promise<FileDeleteResult[]> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeListDirectory(_path: string): Promise<DirectoryEntry[]> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeGetFileInfo(_paths: string[]): Promise<Map<string, FileInfo>> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeMoveFiles(_entries: MoveEntry[]): Promise<void> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeReplaceContent(_entries: ContentReplaceEntry[]): Promise<void> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeCreateDirectories(
    _paths: string[],
    _options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeDeleteDirectories(
    _paths: string[],
    _options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    throw new FileOperationError('Native filesystem not supported', '', 'TRANSFER_ERROR');
  }

  protected nativeReadFileStream(_path: string): AsyncIterable<Uint8Array> {
    throw new FileOperationError('Native streaming not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeWriteFileStream(
    _path: string,
    _stream: ReadableStream<Uint8Array>
  ): Promise<void> {
    throw new FileOperationError('Native streaming not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeSetPermissions(_entries: PermissionEntry[]): Promise<void> {
    throw new FileOperationError('Native permissions not supported', '', 'TRANSFER_ERROR');
  }

  protected async nativeSearch(_pattern: string, _path?: string): Promise<SearchResult[]> {
    throw new FileOperationError('Native search not supported', '', 'TRANSFER_ERROR');
  }

  // ==================== Health Check ====================

  protected async nativePing(): Promise<boolean> {
    try {
      const result = await this.execute('echo PING');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  protected async nativeGetMetrics(): Promise<SandboxMetrics> {
    // Read from /proc filesystem via command
    const cpuResult = await this.execute(
      'cat /proc/cpuinfo 2>/dev/null | grep processor | wc -l || echo 1'
    );
    const cpuCount = Number.parseInt(cpuResult.stdout.trim(), 10) || 1;

    const memResult = await this.execute('cat /proc/meminfo 2>/dev/null || echo "MemTotal: 0 kB"');
    const memMatch = memResult.stdout.match(/MemTotal:\s+(\d+)\s+kB/);
    const memoryTotalMiB = memMatch ? Math.floor(Number.parseInt(memMatch[1], 10) / 1024) : 0;

    // Estimate used memory (very rough approximation)
    const memFreeMatch = memResult.stdout.match(/MemFree:\s+(\d+)\s+kB/);
    const memoryUsedMiB =
      memMatch && memFreeMatch
        ? Math.floor(
            (Number.parseInt(memMatch[1], 10) - Number.parseInt(memFreeMatch[1], 10)) / 1024
          )
        : 0;

    return {
      cpuCount,
      cpuUsedPercentage: 0, // Would need multiple samples
      memoryTotalMiB,
      memoryUsedMiB,
      timestamp: Date.now()
    };
  }
}
