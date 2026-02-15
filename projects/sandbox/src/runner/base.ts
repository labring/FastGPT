import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { ExecuteOptions, ExecuteResult, RunnerConfig } from '../types';
import { config } from '../config';
import { Semaphore } from '../utils/semaphore';

/** 全局信号量，所有 Runner 共享 */
const semaphore = new Semaphore(config.maxConcurrency);

/** 暴露并发状态供 health 接口使用 */
export function getSemaphoreStats() {
  return semaphore.stats;
}

/**
 * SubprocessRunner 基类
 *
 * 所有语言 Runner 的公共逻辑：
 * - 临时目录创建与销毁
 * - 子进程生命周期管理
 * - 超时控制与 SIGKILL
 * - 输出收集与结果解析
 */
export abstract class SubprocessRunner {
  protected runnerConfig: RunnerConfig;

  constructor(runnerConfig: RunnerConfig) {
    this.runnerConfig = runnerConfig;
  }

  /** 子类实现：返回解释器命令和参数 */
  abstract getCommand(scriptPath: string): { command: string; args: string[] };

  /** 子类实现：生成执行脚本，写入临时目录，返回脚本路径 */
  abstract generateScript(
    tempDir: string,
    code: string,
    limits: { timeoutMs: number; memoryMB: number; diskMB: number }
  ): Promise<string>;

  /** 子类可覆盖：执行前的预检（如危险导入检测） */
  protected preCheck(_code: string): void {
    // 默认不做检查
  }

  /** 执行用户代码 */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { code, variables, limits } = options;

    // 参数校验
    if (!code || typeof code !== 'string' || !code.trim()) {
      return { success: false, message: 'Code cannot be empty' };
    }

    // 合并限制参数，并做上限校验
    const timeoutMs = Math.min(
      limits?.timeoutMs ?? this.runnerConfig.defaultTimeoutMs,
      config.maxTimeoutMs
    );
    const memoryMB = Math.min(
      limits?.memoryMB ?? this.runnerConfig.defaultMemoryMB,
      config.maxMemoryMB
    );
    const diskMB = Math.min(
      limits?.diskMB ?? this.runnerConfig.defaultDiskMB,
      config.maxDiskMB
    );

    // 预检
    try {
      this.preCheck(code);
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }

    // 并发控制：排队等待许可
    await semaphore.acquire();

    const tempDir = await mkdtemp(join(tmpdir(), 'sandbox_'));

    try {
      // 1. 生成执行脚本
      const scriptPath = await this.generateScript(tempDir, code, {
        timeoutMs,
        memoryMB,
        diskMB
      });

      // 2. spawn 子进程
      const { command, args } = this.getCommand(scriptPath);
      const proc = spawn(command, args, {
        cwd: tempDir,
        env: {
          SANDBOX_TMPDIR: tempDir,
          SANDBOX_MEMORY_MB: String(memoryMB),
          SANDBOX_DISK_MB: String(diskMB),
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 3. 通过 stdin 传入 variables
      proc.stdin!.write(JSON.stringify({ variables }));
      proc.stdin!.end();

      // 4. 收集输出（带超时）
      return await this.collectResult(proc, timeoutMs);
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    } finally {
      // 5. 释放并发许可
      semaphore.release();
      // 6. 销毁临时目录
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** 收集子进程输出并解析结果 */
  private collectResult(proc: ChildProcess, timeoutMs: number): Promise<ExecuteResult> {
    return new Promise((resolve) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let settled = false;

      const settle = (result: ExecuteResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      proc.stdout!.on('data', (d: Buffer) => stdoutChunks.push(d.toString()));
      proc.stderr!.on('data', (d: Buffer) => stderrChunks.push(d.toString()));

      // 超时强杀
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        settle({
          success: false,
          message: `Script execution timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      proc.on('close', (exitCode: number | null) => {
        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');

        if (exitCode !== 0 && exitCode !== null) {
          settle({
            success: false,
            message: stderr || `Process exited with code ${exitCode}`
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result && result.error) {
            settle({ success: false, message: result.error });
          } else {
            settle({
              success: true,
              data: { codeReturn: result, log: stderr }
            });
          }
        } catch {
          settle({
            success: false,
            message: stdout
              ? `Invalid output: ${stdout.slice(0, 500)}`
              : stderr || 'No output from subprocess'
          });
        }
      });

      proc.on('error', (err) => {
        settle({ success: false, message: `Spawn error: ${err.message}` });
      });
    });
  }
}
