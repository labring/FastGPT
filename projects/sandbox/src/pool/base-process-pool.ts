/**
 * BaseProcessPool - 进程池基类
 *
 * 预热 N 个长驻 worker 进程，通过 stdin/stdout 行协议通信。
 * JS / Python 进程池继承此类，仅需提供 spawn 命令和 init 配置。
 */
import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { config } from '../config';
import type { ExecuteOptions, ExecuteResult } from '../types';

const execAsync = promisify(exec);

// 平台检测：Linux/BSD 支持 prlimit，macOS/Windows 不支持
const isPrlimitSupported = platform() === 'linux' || platform() === 'freebsd';

export type PoolWorker = {
  proc: ChildProcess;
  rl: Interface;
  busy: boolean;
  id: number;
  stderrBuf: string[];
};

export type ProcessPoolOptions = {
  /** 日志前缀，如 "JS" / "Python" */
  name: string;
  /** worker 脚本绝对路径 */
  workerScript: string;
  /** 生成 spawn 命令 */
  spawnCommand: (script: string) => string;
  /** init 消息中的模块白名单 */
  allowedModules: readonly string[];
};

export abstract class BaseProcessPool {
  protected workers: PoolWorker[] = [];
  protected idleWorkers: PoolWorker[] = [];
  protected waitQueue: { resolve: (w: PoolWorker) => void; reject: (e: Error) => void }[] = [];
  protected nextId = 0;
  protected poolSize: number;
  protected ready = false;
  protected healthCheckTimer?: ReturnType<typeof setInterval>;
  protected usePollingFallback = false; // prlimit 不可用时降级到轮询

  protected static readonly HEALTH_CHECK_INTERVAL = 30_000;
  protected static readonly HEALTH_CHECK_TIMEOUT = 5_000;
  protected static readonly SPAWN_TIMEOUT = 120_000;

  constructor(
    poolSize: number | undefined,
    protected readonly options: ProcessPoolOptions
  ) {
    this.poolSize = poolSize ?? config.poolSize;
  }

  /** 日志前缀 */
  protected get tag(): string {
    return `${this.options.name}ProcessPool`;
  }

  // ============================================================
  // 生命周期
  // ============================================================

  async init(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.poolSize; i++) {
      promises.push(this.spawnWorker());
    }
    await Promise.all(promises);
    this.ready = true;
    this.startHealthCheck();
    console.log(`${this.tag}: ${this.poolSize} workers preheated`);
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Pool is shutting down'));
    }
    for (const worker of this.workers) {
      worker.proc.kill('SIGTERM');
    }
    this.workers = [];
    this.idleWorkers = [];
    this.waitQueue = [];
  }

  get stats() {
    return {
      total: this.workers.length,
      idle: this.idleWorkers.length,
      busy: this.workers.filter((w) => w.busy).length,
      queued: this.waitQueue.length,
      poolSize: this.poolSize
    };
  }

  // ============================================================
  // Spawn & Worker 管理
  // ============================================================

  protected spawnWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.nextId++;
      const cmd = this.options.spawnCommand(this.options.workerScript);
      const proc = spawn('sh', ['-c', cmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        }
      });

      const rl = createInterface({ input: proc.stdout!, terminal: false });
      const worker: PoolWorker = { proc, rl, busy: false, id, stderrBuf: [] };

      // 收集 stderr 用于调试（保留最近 20 行）
      const stderrRl = createInterface({ input: proc.stderr!, terminal: false });
      stderrRl.on('line', (line: string) => {
        worker.stderrBuf.push(line);
        if (worker.stderrBuf.length > 20) worker.stderrBuf.shift();
      });

      let settled = false;
      const spawnTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rl.removeAllListeners('line');
        proc.kill('SIGKILL');
        const stderr = this.formatStderr(worker);
        reject(
          new Error(
            `${this.tag}: worker ${id} init timeout after ${BaseProcessPool.SPAWN_TIMEOUT}ms${stderr}`
          )
        );
      }, BaseProcessPool.SPAWN_TIMEOUT);

      const onFirstLine = (line: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(spawnTimer);
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'ready') {
            // worker 启动成功，设置操作系统级内存限制（仅 Linux/BSD）
            // 实际限制 = 用户配置 + 运行时开销（50MB for Bun/Python + 沙箱代码）
            if (proc.pid && isPrlimitSupported) {
              const actualLimitMB = config.maxMemoryMB + config.RUNTIME_MEMORY_OVERHEAD_MB;
              this.setMemoryLimit(proc.pid, actualLimitMB).catch((err) => {
                console.warn(`${this.tag}: memory limit setup failed: ${err.message}`);
              });
            }
            this.workers.push(worker);
            this.setupWorkerEvents(worker);
            const waiter = this.waitQueue.shift();
            if (waiter) {
              worker.busy = true;
              waiter.resolve(worker);
            } else {
              this.idleWorkers.push(worker);
            }
            resolve();
          } else {
            reject(new Error(`${this.tag}: worker ${id} init failed: ${line}`));
          }
        } catch {
          reject(new Error(`${this.tag}: worker ${id} invalid init response: ${line}`));
        }
      };
      rl.once('line', onFirstLine);

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(spawnTimer);
        reject(new Error(`${this.tag}: worker ${id} spawn error: ${err.message}`));
      });

      proc.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(spawnTimer);
        rl.removeAllListeners('line');
        const stderr = this.formatStderr(worker);
        reject(
          new Error(
            `${this.tag}: worker ${id} exited during init (code: ${code}, signal: ${signal})${stderr}`
          )
        );
      });

      // 发送 init 消息
      proc.stdin!.write(
        JSON.stringify({
          type: 'init',
          allowedModules: this.options.allowedModules,
          requestLimits: {
            maxRequests: config.maxRequests,
            timeoutMs: config.requestTimeoutMs,
            maxResponseSize: config.maxResponseSize * 1024 * 1024,
            maxRequestBodySize: config.maxRequestBodySize * 1024 * 1024
          }
        }) + '\n'
      );
    });
  }

  protected setupWorkerEvents(worker: PoolWorker): void {
    worker.proc.on('exit', () => {
      const removed = this.removeWorker(worker);
      if (this.ready && removed) {
        this.spawnWorker().catch((err) => {
          console.error(`${this.tag}: failed to respawn worker ${worker.id}:`, err.message);
        });
      }
    });
  }

  protected removeWorker(worker: PoolWorker): boolean {
    const idx = this.workers.indexOf(worker);
    if (idx === -1) return false;
    this.workers.splice(idx, 1);
    this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);
    return true;
  }

  // ============================================================
  // Acquire / Release
  // ============================================================

  protected acquire(): Promise<PoolWorker> {
    const idle = this.idleWorkers.shift();
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    return new Promise<PoolWorker>((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  protected release(worker: PoolWorker): void {
    worker.busy = false;
    if (!this.workers.includes(worker)) return;
    const waiter = this.waitQueue.shift();
    if (waiter) {
      worker.busy = true;
      waiter.resolve(worker);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  // ============================================================
  // 执行
  // ============================================================

  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { code, variables } = options;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return { success: false, message: 'Code cannot be empty' };
    }

    const timeoutMs = config.maxTimeoutMs;
    const worker = await this.acquire();

    try {
      return await this.sendTask(
        worker,
        { code, variables: variables || {}, timeoutMs },
        timeoutMs
      );
    } finally {
      this.release(worker);
    }
  }

  protected sendTask(
    worker: PoolWorker,
    task: { code: string; variables: Record<string, any>; timeoutMs: number },
    timeoutMs: number
  ): Promise<ExecuteResult> {
    return new Promise<ExecuteResult>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;

      const settle = (result: ExecuteResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.rl.removeListener('line', onLine);
        worker.proc.removeListener('exit', onExit);
        resolve(result);
      };

      const onLine = (line: string) => {
        try {
          settle(JSON.parse(line));
        } catch {
          settle({ success: false, message: 'Invalid worker response' });
        }
      };

      const onExit = (code: number | null, signal: string | null) => {
        const stderr = this.formatStderr(worker);
        settle({
          success: false,
          message: `Worker crashed during execution (exit code: ${code}, signal: ${signal})${stderr}`
        });
      };

      // 超时
      timer = setTimeout(() => {
        this.killAndRespawn(worker);
        settle({ success: false, message: `Script execution timed out after ${timeoutMs}ms` });
      }, timeoutMs + 2000);

      worker.rl.once('line', onLine);
      worker.proc.once('exit', onExit);

      try {
        worker.proc.stdin!.write(JSON.stringify(task) + '\n');
      } catch (err: any) {
        settle({ success: false, message: `Worker communication error: ${err.message}` });
      }
    });
  }

  // ============================================================
  // 健康检查
  // ============================================================

  protected startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.ready) return;
      const idleCopy = [...this.idleWorkers];
      for (const worker of idleCopy) {
        this.pingWorker(worker);
      }
    }, BaseProcessPool.HEALTH_CHECK_INTERVAL);
    if (this.healthCheckTimer.unref) this.healthCheckTimer.unref();
  }

  protected pingWorker(worker: PoolWorker): void {
    if (worker.busy || !this.idleWorkers.includes(worker)) return;

    this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);

    const replaceWorker = (reason: string) => {
      console.warn(`${this.tag}: worker ${worker.id} ${reason}, replacing`);
      this.killAndRespawn(worker);
    };

    const returnToIdle = () => {
      if (!worker.busy && this.workers.includes(worker) && !this.idleWorkers.includes(worker)) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          worker.busy = true;
          waiter.resolve(worker);
        } else {
          this.idleWorkers.push(worker);
        }
      }
    };

    const timer = setTimeout(() => {
      worker.rl.removeListener('line', onPong);
      replaceWorker('health check timeout (no pong)');
    }, BaseProcessPool.HEALTH_CHECK_TIMEOUT);

    const onPong = (line: string) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(line);
        if (msg.type !== 'pong') {
          replaceWorker('health check invalid response');
        } else {
          returnToIdle();
        }
      } catch {
        replaceWorker('health check parse error');
      }
    };

    try {
      if (!worker.proc.stdin!.writable) {
        clearTimeout(timer);
        replaceWorker('stdin not writable');
        return;
      }
      worker.rl.once('line', onPong);
      worker.proc.stdin!.write(JSON.stringify({ type: 'ping' }) + '\n');
    } catch {
      clearTimeout(timer);
      replaceWorker('health check write error');
    }
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 使用 prlimit 设置操作系统级内存限制
   * @param pid 进程 ID
   * @param actualLimitMB 实际进程内存限制（MB）= 用户可用 + 运行时开销
   * @returns 是否成功设置
   */
  protected async setMemoryLimit(pid: number, actualLimitMB: number): Promise<boolean> {
    try {
      const limitBytes = actualLimitMB * 1024 * 1024;
      // prlimit 设置 RLIMIT_AS（地址空间限制）
      // 格式：prlimit --as=soft:hard pid
      // Linux/macOS/BSD 支持，需要 util-linux 或 linux-prlimit
      await execAsync(`prlimit --as=${limitBytes}:${limitBytes} ${pid}`);
      const userAvailable = actualLimitMB - config.RUNTIME_MEMORY_OVERHEAD_MB;
      console.log(
        `${this.tag}: worker ${pid} memory limit set to ${actualLimitMB}MB ` +
          `(user available: ${userAvailable}MB, runtime overhead: ${config.RUNTIME_MEMORY_OVERHEAD_MB}MB)`
      );
      return true;
    } catch (e: any) {
      console.warn(
        `${this.tag}: failed to set memory limit via prlimit for worker ${pid}: ${e.message || e}`
      );
      return false;
    }
  }

  /** 从池中移除 worker，kill 进程，并在 ready 时 respawn */
  protected killAndRespawn(worker: PoolWorker): void {
    this.removeWorker(worker);
    worker.proc.kill('SIGKILL');
    if (this.ready) {
      this.spawnWorker().catch((err) => {
        console.error(`${this.tag}: failed to respawn worker ${worker.id}:`, err.message);
      });
    }
  }

  /** 格式化 stderr 缓冲区用于错误信息 */
  protected formatStderr(worker: PoolWorker): string {
    return worker.stderrBuf.length > 0 ? ` | stderr: ${worker.stderrBuf.join('\n')}` : '';
  }
}
