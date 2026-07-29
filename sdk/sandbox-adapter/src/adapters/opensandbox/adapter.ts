import type { Execution, ExecutionHandlers, WriteEntry } from '@alibaba-group/opensandbox';
import { CommandExecutionError, FeatureNotSupportedError, SandboxStateError } from '../../errors';
import type {
  BackgroundExecution,
  ContentReplaceEntry,
  DirectoryEntry,
  Endpoint,
  ExecuteOptions,
  ExecuteResult,
  ExecuteStreamOptions,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteEntry,
  FileWriteResult,
  MoveEntry,
  PermissionEntry,
  ReadFileOptions,
  SandboxCapabilities,
  SandboxEndpointSelector,
  SandboxEnsureRunningOptions,
  SandboxId,
  SandboxInfo,
  SandboxMetrics,
  SandboxStatus,
  SearchResult
} from '../../types';
import {
  getFileDataByteLength,
  isReadableStreamData,
  octalNumberToPosixMode,
  posixModeToOctalNumber
} from '../../utils/files';
import { BoundedOutputBuffer } from '../../utils/outputBuffer';
import { BaseSandboxAdapter } from '../base';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from './constants';
import { OpenSandboxLifecycle } from './lifecycle';
import type {
  OpenSandboxConfigType,
  OpenSandboxConnectionConfig,
  SandboxRuntimeType
} from './types';

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

/** OpenSandbox provider facade backed by the 0.1.10 native SDK services. */
export class OpenSandboxAdapter extends BaseSandboxAdapter {
  readonly provider = 'opensandbox' as const;
  readonly runtime: SandboxRuntimeType;
  readonly capabilities: SandboxCapabilities = {
    command: { streaming: true, background: true, interrupt: true },
    filesystem: { streamingRead: true, streamingWrite: true },
    metrics: true,
    expirationRenewal: true
  };

  private readonly lifecycle: OpenSandboxLifecycle;

  constructor(
    connectionConfig: OpenSandboxConnectionConfig,
    private readonly createConfig?: OpenSandboxConfigType
  ) {
    super();
    this.runtime = connectionConfig.runtime ?? 'docker';
    this.lifecycle = new OpenSandboxLifecycle(connectionConfig, createConfig);
  }

  get rootPath(): string {
    const mountPath = this.createConfig?.volumes?.[0]?.mountPath;
    return mountPath ? mountPath.replace(/\/+$/, '') : OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  }

  get id(): SandboxId | undefined {
    return this.lifecycle.id;
  }

  override get status(): SandboxStatus {
    return this.lifecycle.status;
  }

  async ensureRunning(options?: SandboxEnsureRunningOptions): Promise<void> {
    await this.lifecycle.ensureRunning(options);
  }

  async create(): Promise<void> {
    await this.lifecycle.create();
  }

  async connect(sandboxId: SandboxId): Promise<void> {
    await this.lifecycle.connect(sandboxId);
  }

  async start(): Promise<void> {
    await this.lifecycle.start();
  }

  async stop(): Promise<void> {
    await this.lifecycle.stop();
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    await this.lifecycle.delete(sandboxId);
  }

  async close(): Promise<void> {
    await this.lifecycle.close();
  }

  async getInfo(): Promise<SandboxInfo | null> {
    return this.lifecycle.getInfo();
  }

  async renewExpiration(timeoutSeconds: number): Promise<void> {
    await this.lifecycle.renewExpiration(timeoutSeconds);
  }

  async getEndpoint(selector: SandboxEndpointSelector): Promise<Endpoint> {
    const raw = await this.lifecycle.sandbox.getEndpointUrl(selector);
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : selector,
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      url: raw
    };
  }

  async readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]> {
    const results: FileReadResult[] = [];

    for (const inputPath of paths) {
      const path = this.normalizePath(inputPath);
      try {
        const readOptions =
          options?.offset !== undefined || options?.length !== undefined
            ? this.validateReadOptions(options)
            : undefined;
        const content = await this.lifecycle.sandbox.files.readBytes(
          path,
          readOptions ? { offset: readOptions.offset, limit: readOptions.length } : undefined
        );
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
    const results: FileWriteResult[] = [];

    for (const entry of entries) {
      const path = this.normalizePath(entry.path);
      let streamedBytes = 0;
      try {
        const data: WriteEntry['data'] = (() => {
          if (!isReadableStreamData(entry.data)) return entry.data;

          const source = entry.data;
          return (async function* () {
            const reader = source.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                if (value) {
                  streamedBytes += value.byteLength;
                  yield value;
                }
              }
            } finally {
              reader.releaseLock();
            }
          })();
        })();

        await this.lifecycle.sandbox.files.writeFiles([
          {
            ...entry,
            path,
            data,
            mode: entry.mode === undefined ? undefined : posixModeToOctalNumber(entry.mode)
          }
        ]);
        results.push({
          path,
          bytesWritten: isReadableStreamData(entry.data)
            ? streamedBytes
            : getFileDataByteLength(entry.data),
          error: null
        });
      } catch (error) {
        results.push({
          path,
          bytesWritten: 0,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    const results: FileDeleteResult[] = [];
    for (const inputPath of paths) {
      const path = this.normalizePath(inputPath);
      try {
        await this.lifecycle.sandbox.files.deleteFiles([path]);
        results.push({ path, success: true, error: null });
      } catch (error) {
        results.push({
          path,
          success: false,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }
    return results;
  }

  async moveFiles(entries: MoveEntry[]): Promise<void> {
    await this.lifecycle.sandbox.files.moveFiles(
      entries.map(({ source, destination }) => ({
        src: this.normalizePath(source),
        dest: this.normalizePath(destination)
      }))
    );
  }

  async replaceContent(entries: ContentReplaceEntry[]): Promise<void> {
    await this.lifecycle.sandbox.files.replaceContents(
      entries.map((entry) => ({ ...entry, path: this.normalizePath(entry.path) }))
    );
  }

  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    await this.lifecycle.sandbox.files.createDirectories(
      paths.map((path) => ({
        path: this.normalizePath(path),
        ...options,
        mode: options?.mode === undefined ? undefined : posixModeToOctalNumber(options.mode)
      }))
    );
  }

  async deleteDirectories(paths: string[]): Promise<void> {
    await this.lifecycle.sandbox.files.deleteDirectories(
      paths.map((path) => this.normalizePath(path))
    );
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries = await this.lifecycle.sandbox.files.listDirectory({
      path: this.normalizePath(path)
    });
    return entries.map((entry) => ({
      name: entry.path.split('/').filter(Boolean).pop() ?? entry.path,
      path: entry.path,
      isDirectory: entry.type === 'directory',
      isFile: entry.type === 'file',
      size: entry.size,
      modifiedAt: entry.modifiedAt
    }));
  }

  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const info = await this.lifecycle.sandbox.files.getFileInfo(
      paths.map((path) => this.normalizePath(path))
    );
    return new Map(
      Object.entries(info).map(([path, entry]) => [
        path,
        {
          ...entry,
          mode: entry.mode === undefined ? undefined : octalNumberToPosixMode(entry.mode),
          isDirectory: entry.type === 'directory',
          isFile: entry.type === 'file',
          isSymlink: entry.type === 'symlink'
        }
      ])
    );
  }

  async setPermissions(entries: PermissionEntry[]): Promise<void> {
    const paths = entries.map((entry) => this.normalizePath(entry.path));
    const currentInfo = entries.some((entry) => entry.mode === undefined)
      ? await this.lifecycle.sandbox.files.getFileInfo(paths)
      : {};

    await this.lifecycle.sandbox.files.setPermissions(
      entries.map((entry, index) => {
        const path = paths[index] as string;
        const mode =
          entry.mode ??
          (currentInfo[path]?.mode === undefined
            ? undefined
            : octalNumberToPosixMode(currentInfo[path].mode));
        if (mode === undefined) throw new Error(`Cannot preserve file mode for ${path}`);
        return { ...entry, path, mode: posixModeToOctalNumber(mode) };
      })
    );
  }

  async search(pattern: string, path: string = '.'): Promise<SearchResult[]> {
    const results = await this.lifecycle.sandbox.files.search({
      path: this.normalizePath(path),
      pattern
    });
    return results.map((entry) => ({
      path: entry.path,
      isDirectory: entry.type === 'directory',
      isFile: entry.type === 'file'
    }));
  }

  override readFileStream(path: string): AsyncIterable<Uint8Array> {
    return this.lifecycle.sandbox.files.readBytesStream(this.normalizePath(path));
  }

  override async writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    await this.lifecycle.sandbox.files.writeFiles([
      { path: this.normalizePath(path), data: stream }
    ]);
  }

  private getCommandTimeoutSeconds(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined || timeoutMs <= 0) return undefined;
    return Math.ceil(timeoutMs / 1000);
  }

  private toExecuteResult(
    execution: Execution,
    buffers: { stdout: BoundedOutputBuffer; stderr: BoundedOutputBuffer }
  ): ExecuteResult {
    return {
      stdout: buffers.stdout.toString(),
      stderr: buffers.stderr.toString(),
      exitCode: execution.exitCode ?? null,
      durationMs: execution.complete?.executionTimeMs,
      truncated: buffers.stdout.truncated || buffers.stderr.truncated
    };
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const maxBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const buffers = {
      stdout: new BoundedOutputBuffer(maxBytes, '\n'),
      stderr: new BoundedOutputBuffer(maxBytes, '\n')
    };

    try {
      const execution = await this.lifecycle.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs),
          envs: options?.env
        },
        {
          skipAccumulation: true,
          onStdout: (message) => buffers.stdout.append(message.text),
          onStderr: (message) => buffers.stderr.append(message.text)
        },
        options?.signal
      );
      return this.toExecuteResult(execution, buffers);
    } catch (error) {
      if (error instanceof SandboxStateError) throw error;
      throw new CommandExecutionError(
        `Command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async executeStream(command: string, options: ExecuteStreamOptions): Promise<void> {
    const wantsComplete = Boolean(options.onComplete);
    const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const buffers = wantsComplete
      ? {
          stdout: new BoundedOutputBuffer(maxBytes, '\n'),
          stderr: new BoundedOutputBuffer(maxBytes, '\n')
        }
      : undefined;

    try {
      const handlers: ExecutionHandlers = {
        skipAccumulation: true,
        ...(options.onStdout || buffers
          ? {
              onStdout: async (message: { text: string }) => {
                buffers?.stdout.append(message.text);
                await options.onStdout?.(message);
              }
            }
          : {}),
        ...(options.onStderr || buffers
          ? {
              onStderr: async (message: { text: string }) => {
                buffers?.stderr.append(message.text);
                await options.onStderr?.(message);
              }
            }
          : {}),
        ...(options.onError
          ? {
              onError: async (sdkError) => {
                const error = new Error(sdkError.value ?? sdkError.name ?? 'Execution error');
                error.name = sdkError.name ?? 'ExecutionError';
                if (sdkError.traceback?.length) error.stack = sdkError.traceback.join('\n');
                await options.onError?.(error);
              }
            }
          : {})
      };

      const execution = await this.lifecycle.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options.workingDirectory),
          timeoutSeconds: this.getCommandTimeoutSeconds(options.timeoutMs),
          envs: options.env
        },
        handlers,
        options.signal
      );

      if (options.onComplete && buffers) {
        await options.onComplete(this.toExecuteResult(execution, buffers));
      }
    } catch (error) {
      if (error instanceof SandboxStateError) throw error;
      throw new CommandExecutionError(
        `Streaming command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async executeBackground(command: string, options?: ExecuteOptions): Promise<BackgroundExecution> {
    try {
      const execution = await this.lifecycle.sandbox.commands.run(
        command,
        {
          workingDirectory: this.normalizePath(options?.workingDirectory),
          background: true,
          timeoutSeconds: this.getCommandTimeoutSeconds(options?.timeoutMs),
          envs: options?.env
        },
        { skipAccumulation: true },
        options?.signal
      );
      if (!execution.id) {
        throw new CommandExecutionError(
          'Background execution did not return a session ID',
          command
        );
      }

      const sessionId = execution.id;
      const sandbox = this.lifecycle.sandbox;
      return {
        sessionId,
        kill: async () => {
          await sandbox.commands.interrupt(sessionId).catch((error) => {
            throw new CommandExecutionError(
              `Failed to kill background session ${sessionId}`,
              'interrupt',
              error instanceof Error ? error : undefined
            );
          });
        }
      };
    } catch (error) {
      if (error instanceof CommandExecutionError || error instanceof SandboxStateError) throw error;
      throw new CommandExecutionError(
        `Background command execution failed: ${command}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    try {
      await this.lifecycle.sandbox.commands.interrupt(sessionId);
    } catch (error) {
      throw new CommandExecutionError(
        `Failed to interrupt session ${sessionId}`,
        'interrupt',
        error instanceof Error ? error : undefined
      );
    }
  }

  async ping(): Promise<boolean> {
    return this.lifecycle.sandbox.isHealthy();
  }

  async getMetrics(): Promise<SandboxMetrics> {
    if (!this.capabilities.metrics) {
      throw new FeatureNotSupportedError('Metrics are not supported', 'getMetrics', this.provider);
    }
    return this.lifecycle.sandbox.metrics.getMetrics();
  }
}
