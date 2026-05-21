import { Sandbox, CommandExitError, FileType } from '@e2b/code-interpreter';
import { BaseSandboxAdapter } from '../BaseSandboxAdapter';
import { CommandPolyfillService } from '@/polyfill/CommandPolyfillService';
import { CommandExecutionError, ConnectionError } from '@/errors';
import type {
  ExecuteOptions,
  ExecuteResult,
  SandboxId,
  SandboxInfo,
  FileWriteEntry,
  FileWriteResult,
  FileDeleteResult,
  FileReadResult,
  MoveEntry,
  DirectoryEntry
} from '@/types';
import type { E2BConfig } from './type';

/**
 * E2B 沙盒适配器 - 使用官方 SDK
 *
 * 使用 metadata 映射上游 sandboxId 到 E2B 实际 ID
 */
export class E2BAdapter extends BaseSandboxAdapter {
  readonly provider = 'e2b' as const;

  get rootPath(): string {
    return '/home/user';
  }

  private sandbox: Sandbox | null = null;
  private _id: SandboxId; // 上游指定的 ID

  constructor(private config: E2BConfig) {
    super();
    this._id = config.sandboxId;

    // 初始化 polyfill 服务用于搜索等功能
    this.polyfillService = new CommandPolyfillService(this);
  }

  get id(): SandboxId {
    return this._id; // 始终返回上游 ID
  }

  /**
   * 通过 metadata 查找 E2B 沙盒实例
   * @returns E2B Sandbox 实例，如果未找到则返回 null
   */
  private async findSandbox(): Promise<Sandbox | null> {
    try {
      const paginator = Sandbox.list({
        apiKey: this.config.apiKey,
        query: {
          metadata: { upstreamId: this._id }
        },
        limit: 1
      });

      const sandboxes = await paginator.nextItems();
      if (sandboxes.length > 0) {
        const sandboxInfo = sandboxes[0];
        // 连接到找到的沙盒
        const sandbox = await Sandbox.connect(sandboxInfo.sandboxId, {
          apiKey: this.config.apiKey
        });
        return sandbox;
      }

      return null;
    } catch (error) {
      console.error('Failed to find sandbox by metadata:', error);
      return Promise.reject(new Error('Failed to find sandbox by metadata'));
    }
  }

  // ==================== 生命周期方法 ====================

  private async ensureSandbox(): Promise<Sandbox> {
    await this.ensureRunning();
    return this.sandbox!;
  }
  async ensureRunning(): Promise<void> {
    try {
      // 1. 如果没有沙盒实例，先通过 metadata 查找
      if (!this.sandbox) {
        this.sandbox = await this.findSandbox();
      }

      // 2. 如果找到了实例，检查是否运行中
      if (this.sandbox) {
        const isRunning = await this.sandbox.isRunning();
        if (isRunning) {
          this._status = { state: 'Running' };
          return;
        }
        // 暂停状态，需要重新连接
        await Sandbox.connect(this.sandbox.sandboxId, {
          apiKey: this.config.apiKey
        });
        await this.waitUntilReady();
        this._status = { state: 'Running' };
        return;
      }

      // 3. 没有找到，创建新沙盒
      await this.create();
    } catch (error) {
      throw new ConnectionError('Failed to ensure sandbox running', 'e2b', error);
    }
  }

  async create(): Promise<void> {
    try {
      this._status = { state: 'Creating' };

      const options = {
        apiKey: this.config.apiKey,
        template: this.config.template,
        timeout: this.config.timeout,
        envs: this.config.envs,
        metadata: {
          ...this.config.metadata,
          upstreamId: this._id // 关键：绑定上游 ID
        }
      };

      this.sandbox = await Sandbox.create(options);
      await this.waitUntilReady();
      this._status = { state: 'Running' };
    } catch (error) {
      this._status = { state: 'Error', message: String(error) };
      throw new ConnectionError('Failed to create E2B sandbox', 'e2b', error);
    }
  }

  async start(): Promise<void> {
    // E2B 沙盒创建后即为运行状态
    // 如果是暂停状态，通过 connect 恢复
    await this.ensureSandbox();
  }

  async stop(): Promise<void> {
    const sandbox = await this.ensureSandbox();

    try {
      this._status = { state: 'Stopping' };

      // E2B 使用 pause 暂停沙盒
      await sandbox.pause({
        apiKey: this.config.apiKey
      });
      this._status = { state: 'Stopped' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to pause E2B sandbox',
        'stop',
        error instanceof Error ? error : undefined
      );
    }
  }

  async delete(sandboxId?: SandboxId): Promise<void> {
    if (sandboxId) {
      this._id = sandboxId;
      this.sandbox = null;
    }
    const sandbox = await this.ensureSandbox();

    try {
      this._status = { state: 'Deleting' };
      await sandbox.kill();
      this.sandbox = null;
      this._status = { state: 'UnExist' };
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to kill E2B sandbox',
        'delete',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getInfo(): Promise<SandboxInfo | null> {
    try {
      const sandbox = await this.ensureSandbox();

      const isRunning = await sandbox.isRunning();

      return {
        id: this._id,
        image: { repository: this.config.template || 'default' },
        entrypoint: [],
        status: {
          state: isRunning ? 'Running' : 'Stopped'
        },
        createdAt: new Date()
      };
    } catch {
      return null;
    }
  }

  // ==================== 命令执行 ====================

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    try {
      const sandbox = await this.ensureSandbox();
      const result = await sandbox.commands.run(command, {
        cwd: this.normalizePath(options?.workingDirectory),
        timeoutMs: options?.timeoutMs
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
      // E2B SDK 在非零退出码时抛出 CommandExitError，需要提取结果而非抛出异常
      if (error instanceof CommandExitError) {
        return {
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? '',
          exitCode: error.exitCode ?? 1
        };
      }

      throw new CommandExecutionError(
        `Command execution failed: ${error}`,
        command,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ==================== 文件系统操作（原生实现）====================

  async readFiles(paths: string[]): Promise<FileReadResult[]> {
    const sandbox = await this.ensureSandbox();

    try {
      const results: FileReadResult[] = [];

      for (const path of paths.map((p) => this.normalizePath(p))) {
        try {
          const content = await sandbox.files.read(path);
          results.push({
            path,
            content: Buffer.from(content),
            error: null
          });
        } catch (error) {
          results.push({
            path,
            content: new Uint8Array(),
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }

      return results;
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to read files',
        'readFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  async writeFiles(files: FileWriteEntry[]): Promise<FileWriteResult[]> {
    const sandbox = await this.ensureSandbox();

    try {
      const results: FileWriteResult[] = [];

      // E2B 支持批量写入
      const writeData = files.map((f) => {
        let data: string | ArrayBuffer;
        if (typeof f.data === 'string') {
          data = f.data;
        } else if (f.data instanceof Uint8Array) {
          data = f.data.buffer as ArrayBuffer;
        } else if (f.data instanceof ArrayBuffer) {
          data = f.data;
        } else {
          // Blob or ReadableStream - convert to string for now
          data = '';
        }

        return {
          path: this.normalizePath(f.path),
          data
        };
      });

      try {
        await sandbox.files.write(writeData);

        // 所有写入成功
        for (const file of files) {
          let size = 0;
          if (typeof file.data === 'string') {
            size = Buffer.byteLength(file.data);
          } else if (file.data instanceof ArrayBuffer) {
            size = file.data.byteLength;
          } else if (file.data instanceof Uint8Array) {
            size = file.data.byteLength;
          }

          results.push({
            path: file.path,
            bytesWritten: size,
            error: null
          });
        }
      } catch (error) {
        // 批量写入失败，返回错误
        for (const file of files) {
          results.push({
            path: file.path,
            bytesWritten: 0,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }

      return results;
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to write files',
        'writeFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteFiles(paths: string[]): Promise<FileDeleteResult[]> {
    const sandbox = await this.ensureSandbox();

    try {
      const results: FileDeleteResult[] = [];

      for (const path of paths.map((p) => this.normalizePath(p))) {
        try {
          await sandbox.files.remove(path);
          results.push({
            path,
            success: true,
            error: null
          });
        } catch (error) {
          results.push({
            path,
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }

      return results;
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to delete files',
        'deleteFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  async moveFiles(moves: MoveEntry[]): Promise<void> {
    const sandbox = await this.ensureSandbox();

    try {
      for (const { source, destination } of moves) {
        await sandbox.files.rename(this.normalizePath(source), this.normalizePath(destination));
      }
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to move files',
        'moveFiles',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createDirectories(paths: string[]): Promise<void> {
    const sandbox = await this.ensureSandbox();

    try {
      for (const path of paths.map((p) => this.normalizePath(p))) {
        await sandbox.files.makeDir(path);
      }
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to create directories',
        'createDirectories',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteDirectories(paths: string[]): Promise<void> {
    const sandbox = await this.ensureSandbox();

    try {
      for (const path of paths.map((p) => this.normalizePath(p))) {
        await sandbox.files.remove(path);
      }
    } catch (error) {
      throw new CommandExecutionError(
        'Failed to delete directories',
        'deleteDirectories',
        error instanceof Error ? error : undefined
      );
    }
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const sandbox = await this.ensureSandbox();

    try {
      const entries = await sandbox.files.list(this.normalizePath(path));

      return entries.map((entry) => {
        const isDirectory = entry.type === FileType.DIR;

        return {
          name: entry.name,
          path: entry.path,
          isDirectory,
          isFile: !isDirectory,
          size: entry.size
        };
      });
    } catch (error) {
      throw new CommandExecutionError(
        `Failed to list directory: ${path}`,
        'listDirectory',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ==================== 健康检查 ====================

  async ping(): Promise<boolean> {
    try {
      const sandbox = await this.ensureSandbox();
      return await sandbox.isRunning();
    } catch {
      return false;
    }
  }
}

export type { E2BConfig } from './type';
