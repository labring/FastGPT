/**
 * PythonProcessPool - Python 子进程池
 *
 * 预热 N 个长驻 python3 worker 进程（worker.py），通过 stdin/stdout 行协议通信。
 * 启动时发送 init 消息传入 allowedModules，后续通过行协议收发任务。
 */
import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { join } from 'path';
import { config } from '../config';
import type { ExecuteOptions, ExecuteResult } from '../types';

const WORKER_SCRIPT = join(
  typeof import.meta.dir === 'string' ? import.meta.dir : new URL('.', import.meta.url).pathname,
  'worker.py'
);

interface PoolWorker {
  proc: ChildProcess;
  rl: Interface;
  busy: boolean;
  id: number;
}

export class PythonProcessPool {
  private workers: PoolWorker[] = [];
  private idleWorkers: PoolWorker[] = [];
  private waitQueue: { resolve: (worker: PoolWorker) => void; reject: (err: Error) => void }[] = [];
  private nextId = 0;
  private poolSize: number;
  private ready = false;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private static readonly HEALTH_CHECK_INTERVAL = 30_000;
  private static readonly HEALTH_CHECK_TIMEOUT = 5_000;
  private static readonly SPAWN_TIMEOUT = 120_000;

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? config.poolSize;
  }

  /** 初始化：预热所有 worker */
  async init(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.poolSize; i++) {
      promises.push(this.spawnWorker());
    }
    await Promise.all(promises);
    this.ready = true;
    this.startHealthCheck();
    console.log(`PythonProcessPool: ${this.poolSize} workers preheated`);
  }

  /** 创建并初始化一个 worker */
  private spawnWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.nextId++;
      const maxMemoryKB = config.maxMemoryMB * 1024;
      // ulimit -v 仅 Linux 生效，macOS 不支持
      const useUlimit = process.platform === 'linux';
      const cmd = useUlimit
        ? `ulimit -v ${maxMemoryKB} && exec python3 -u ${WORKER_SCRIPT}`
        : `exec python3 -u ${WORKER_SCRIPT}`;
      const proc = spawn('sh', ['-c', cmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        }
      });

      const rl = createInterface({ input: proc.stdout!, terminal: false });
      const worker: PoolWorker = { proc, rl, busy: false, id };

      let settled = false;
      // H6: init 超时保护，防止 worker 启动卡住导致 pool.init() 永远挂起
      const spawnTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rl.removeAllListeners('line');
        proc.kill('SIGKILL');
        reject(
          new Error(`Python worker ${id} init timeout after ${PythonProcessPool.SPAWN_TIMEOUT}ms`)
        );
      }, PythonProcessPool.SPAWN_TIMEOUT);

      // 等待 init ready 响应
      const onFirstLine = (line: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(spawnTimer);
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'ready') {
            this.workers.push(worker);
            this.setupWorkerEvents(worker);
            // 如果有等待中的请求，直接分配；否则放入 idle
            const waiter = this.waitQueue.shift();
            if (waiter) {
              worker.busy = true;
              waiter.resolve(worker);
            } else {
              this.idleWorkers.push(worker);
            }
            resolve();
          } else {
            reject(new Error(`Python worker ${id} init failed: ${line}`));
          }
        } catch {
          reject(new Error(`Python worker ${id} invalid init response: ${line}`));
        }
      };
      rl.once('line', onFirstLine);

      proc.stderr?.resume();

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(spawnTimer);
        reject(new Error(`Python worker ${id} spawn error: ${err.message}`));
      });

      // 发送 init 消息
      proc.stdin!.write(
        JSON.stringify({
          type: 'init',
          allowedModules: config.pythonAllowedModules,
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

  /** 设置 worker 退出自动恢复 */
  private setupWorkerEvents(worker: PoolWorker): void {
    worker.proc.on('exit', () => {
      const removed = this.removeWorker(worker);
      if (this.ready && removed) {
        this.spawnWorker().catch((err) => {
          console.error(`PythonProcessPool: failed to respawn worker ${worker.id}:`, err.message);
        });
      }
    });
  }

  /** 从池中移除 worker，返回是否真的移除了 */
  private removeWorker(worker: PoolWorker): boolean {
    const idx = this.workers.indexOf(worker);
    if (idx === -1) return false;
    this.workers.splice(idx, 1);
    this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);
    return true;
  }

  private acquire(): Promise<PoolWorker> {
    const idle = this.idleWorkers.shift();
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    return new Promise<PoolWorker>((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  private release(worker: PoolWorker): void {
    worker.busy = false;
    // worker 已被 kill 或已移除，不归还
    if (!this.workers.includes(worker)) return;
    const waiter = this.waitQueue.shift();
    if (waiter) {
      worker.busy = true;
      waiter.resolve(worker);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  /** 执行用户代码 */
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

  private sendTask(
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

      // worker 崩溃时提前 settle
      const onExit = (code: number | null, signal: string | null) => {
        settle({
          success: false,
          message: `Python worker crashed during execution (exit code: ${code}, signal: ${signal})`
        });
      };

      timer = setTimeout(() => {
        this.removeWorker(worker);
        worker.proc.kill('SIGKILL');
        // 主动 respawn
        if (this.ready) {
          this.spawnWorker().catch((err) => {
            console.error(`PythonProcessPool: failed to respawn worker ${worker.id}:`, err.message);
          });
        }
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

  /** 定期健康检查：检测僵死的 idle worker */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.ready) return;
      const idleCopy = [...this.idleWorkers];
      for (const worker of idleCopy) {
        this.pingWorker(worker);
      }
    }, PythonProcessPool.HEALTH_CHECK_INTERVAL);
    if (this.healthCheckTimer.unref) this.healthCheckTimer.unref();
  }

  private pingWorker(worker: PoolWorker): void {
    if (worker.busy || !this.idleWorkers.includes(worker)) return;

    // H8: ping 期间从 idle 中移除，防止 acquire 拿到正在 ping 的 worker 导致响应竞争
    this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);

    const replaceWorker = (reason: string) => {
      console.warn(`PythonProcessPool: worker ${worker.id} ${reason}, replacing`);
      this.removeWorker(worker);
      worker.proc.kill('SIGKILL');
      if (this.ready) {
        this.spawnWorker().catch((err) => {
          console.error(`PythonProcessPool: failed to respawn worker ${worker.id}:`, err.message);
        });
      }
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
    }, PythonProcessPool.HEALTH_CHECK_TIMEOUT);

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

  async shutdown(): Promise<void> {
    this.ready = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    // H7: reject 所有等待中的请求，防止 Promise 永远挂起
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
}
