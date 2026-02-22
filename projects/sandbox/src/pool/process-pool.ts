/**
 * ProcessPool - Bun 子进程池
 *
 * 预热 N 个长驻 bun worker 进程（worker.ts），通过 stdin/stdout 行协议通信。
 * 启动时发送 init 消息传入配置，后续通过行协议收发任务。
 */
import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { join } from 'path';
import { config } from '../config';
import type { ExecuteOptions, ExecuteResult } from '../types';

const WORKER_SCRIPT = join(
  typeof import.meta.dir === 'string' ? import.meta.dir : new URL('.', import.meta.url).pathname,
  'worker.ts'
);

interface PoolWorker {
  proc: ChildProcess;
  rl: Interface;
  busy: boolean;
  id: number;
}

export class ProcessPool {
  private workers: PoolWorker[] = [];
  private idleWorkers: PoolWorker[] = [];
  private waitQueue: ((worker: PoolWorker) => void)[] = [];
  private nextId = 0;
  private poolSize: number;
  private ready = false;

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
    console.log(`ProcessPool: ${this.poolSize} workers preheated`);
  }

  /** 创建并初始化一个 worker */
  private spawnWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.nextId++;
      const proc = spawn('bun', ['run', WORKER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        }
      });

      const rl = createInterface({ input: proc.stdout!, terminal: false });
      const worker: PoolWorker = { proc, rl, busy: false, id };

      // 等待 init ready 响应
      const onFirstLine = (line: string) => {
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'ready') {
            this.workers.push(worker);
            this.idleWorkers.push(worker);
            this.setupWorkerEvents(worker);
            resolve();
          } else {
            reject(new Error(`Worker ${id} init failed: ${line}`));
          }
        } catch {
          reject(new Error(`Worker ${id} invalid init response: ${line}`));
        }
      };
      rl.once('line', onFirstLine);

      // 丢弃 stderr
      proc.stderr?.resume();

      proc.on('error', (err) => {
        reject(new Error(`Worker ${id} spawn error: ${err.message}`));
      });

      // 发送 init 消息
      proc.stdin!.write(JSON.stringify({
        type: 'init',
        allowedModules: config.jsAllowedModules
      }) + '\n');
    });
  }

  /** 设置 worker 退出自动恢复 */
  private setupWorkerEvents(worker: PoolWorker): void {
    worker.proc.on('exit', () => {
      this.removeWorker(worker);
      if (this.ready) {
        this.spawnWorker().catch(err => {
          console.error(`ProcessPool: failed to respawn worker ${worker.id}:`, err.message);
        });
      }
    });
  }

  /** 从池中移除 worker */
  private removeWorker(worker: PoolWorker): void {
    this.workers = this.workers.filter(w => w !== worker);
    this.idleWorkers = this.idleWorkers.filter(w => w !== worker);
  }

  /** 获取一个空闲 worker，没有则排队等待 */
  private acquire(): Promise<PoolWorker> {
    const idle = this.idleWorkers.shift();
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    return new Promise<PoolWorker>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /** 归还 worker 到池中 */
  private release(worker: PoolWorker): void {
    worker.busy = false;
    const waiter = this.waitQueue.shift();
    if (waiter) {
      worker.busy = true;
      waiter(worker);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  /** 执行用户代码 */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { code, variables, limits } = options;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return { success: false, message: 'Code cannot be empty' };
    }

    const timeoutMs = Math.min(
      limits?.timeoutMs ?? config.defaultTimeoutMs,
      config.maxTimeoutMs
    );

    const worker = await this.acquire();

    try {
      return await this.sendTask(worker, { code, variables: variables || {}, timeoutMs }, timeoutMs);
    } finally {
      this.release(worker);
    }
  }

  /** 向 worker 发送任务并等待结果 */
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
        resolve(result);
      };

      const onLine = (line: string) => {
        try {
          settle(JSON.parse(line));
        } catch {
          settle({ success: false, message: 'Invalid worker response' });
        }
      };

      // 超时：杀 worker（会自动 respawn）
      timer = setTimeout(() => {
        worker.proc.kill('SIGKILL');
        settle({ success: false, message: `Script execution timed out after ${timeoutMs}ms` });
      }, timeoutMs + 2000);

      worker.rl.once('line', onLine);

      try {
        worker.proc.stdin!.write(JSON.stringify(task) + '\n');
      } catch (err: any) {
        settle({ success: false, message: `Worker communication error: ${err.message}` });
      }
    });
  }

  /** 关闭所有 worker */
  async shutdown(): Promise<void> {
    this.ready = false;
    for (const worker of this.workers) {
      worker.proc.kill('SIGTERM');
    }
    this.workers = [];
    this.idleWorkers = [];
    this.waitQueue = [];
  }

  /** 池状态 */
  get stats() {
    return {
      total: this.workers.length,
      idle: this.idleWorkers.length,
      busy: this.workers.filter(w => w.busy).length,
      queued: this.waitQueue.length,
      poolSize: this.poolSize
    };
  }
}
