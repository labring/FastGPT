/**
 * BaseProcessPool - 进程池基类
 *
 * 预热 N 个长驻 worker 进程，通过 stdin/stdout 行协议通信。
 * JS / Python 进程池继承此类，仅需提供 spawn 命令和 init 配置。
 */
import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { config } from '../config';
import type { ExecuteOptions, ExecuteResult } from '../types';

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
      let memTimer: ReturnType<typeof setInterval> | undefined;

      const settle = (result: ExecuteResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (memTimer) clearInterval(memTimer);
        worker.rl.removeListener('line', onLine);
        worker.proc.removeListener('exit', onExit);
        resolve(result);
      };

      // 执行期间高频内存监控（仅 Linux），超限立即 kill → 触发 onExit
      const pid = worker.proc.pid;
      if (pid) {
        memTimer = setInterval(() => {
          try {
            const statm = require('fs').readFileSync(`/proc/${pid}/statm`, 'utf-8');
            const rssPages = parseInt(statm.split(' ')[1], 10);
            const rssBytes = rssPages * 4096;
            const limitBytes = config.maxMemoryMB * 1024 * 1024;
            if (rssBytes > limitBytes) {
              console.warn(
                `${this.tag}: worker ${worker.id} RSS ${Math.round(rssBytes / 1024 / 1024)}MB exceeds limit ${config.maxMemoryMB}MB during execution, killing`
              );
              this.killAndRespawn(worker);
            }
          } catch {
            // 非 Linux 或读取失败，跳过
          }
        }, 200);
        if (memTimer.unref) memTimer.unref();
      }

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

  protected checkWorkerMemory(worker: PoolWorker): void {
    const pid = worker.proc.pid;
    if (!pid) return;
    try {
      const statm = require('fs').readFileSync(`/proc/${pid}/statm`, 'utf-8');
      const rssPages = parseInt(statm.split(' ')[1], 10);
      const rssBytes = rssPages * 4096;
      const limitBytes = config.maxMemoryMB * 1024 * 1024;
      if (rssBytes > limitBytes) {
        console.warn(
          `${this.tag}: worker ${worker.id} RSS ${Math.round(rssBytes / 1024 / 1024)}MB exceeds limit ${config.maxMemoryMB}MB, killing`
        );
        this.killAndRespawn(worker);
      }
    } catch {
      // 非 Linux 或读取失败，跳过
    }
  }

  protected startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.ready) return;
      for (const worker of [...this.workers]) {
        this.checkWorkerMemory(worker);
      }
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
