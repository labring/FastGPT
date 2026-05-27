/**
 * BaseProcessPool - 进程池基类
 *
 * 预热 N 个长驻 worker 进程，通过 stdin/stdout 行协议通信。
 * JS / Python 进程池继承此类，仅需提供 spawn 命令和 init 配置。
 */
import { spawn, execFile, execFileSync, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import { readdirSync, readFileSync } from 'fs';
import { promisify } from 'util';
import { platform } from 'os';
import { env, RUNTIME_MEMORY_OVERHEAD_MB } from '../env';
import type { ExecuteOptions, ExecuteResult } from '../types';
import { getLogger, LogCategories } from '../utils/logger';

const serverLogger = getLogger(LogCategories.MODULE.SANDBOX.SERVER);
const execFileAsync = promisify(execFile);

/** RSS 轮询间隔（毫秒） */
const RSS_POLL_INTERVAL = 500;
const PROCESS_GROUP_SUPPORTED = platform() !== 'win32';

export type PoolWorker = {
  proc: ChildProcess;
  rl: Interface;
  stderrRl: Interface;
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
  /** 白名单显式放开后台执行能力时，每次任务结束后回收 worker，清理潜在子进程/线程 */
  recycleAfterTask?: boolean;
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
    this.poolSize = poolSize ?? env.SANDBOX_POOL_SIZE;
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
    serverLogger.info(`${this.tag}: ${this.poolSize} workers preheated`);
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
    this.waitQueue = [];
    for (const worker of this.workers) {
      this.cleanupWorker(worker);
    }
    this.workers = [];
    this.idleWorkers = [];
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
        detached: PROCESS_GROUP_SUPPORTED,
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          CHECK_INTERNAL_IP: String(env.CHECK_INTERNAL_IP)
        }
      });

      const rl = createInterface({ input: proc.stdout!, terminal: false });
      const stderrRl = createInterface({ input: proc.stderr!, terminal: false });
      const worker: PoolWorker = { proc, rl, stderrRl, busy: false, id, stderrBuf: [] };

      // 收集 stderr 用于调试（保留最近 20 行）
      stderrRl.on('line', (line: string) => {
        worker.stderrBuf.push(line);
        if (worker.stderrBuf.length > 20) worker.stderrBuf.shift();
      });

      let settled = false;
      const spawnTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rl.removeAllListeners('line');
        this.killWorkerProcessTree(worker);
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
            maxRequests: env.SANDBOX_REQUEST_MAX_COUNT,
            timeoutMs: env.SANDBOX_REQUEST_TIMEOUT,
            maxResponseSize: env.SANDBOX_REQUEST_MAX_RESPONSE_MB * 1024 * 1024,
            maxRequestBodySize: env.SANDBOX_REQUEST_MAX_BODY_MB * 1024 * 1024,
            maxOutputSize: env.SANDBOX_MAX_OUTPUT_MB * 1024 * 1024
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
          serverLogger.error(`${this.tag}: failed to respawn worker ${worker.id}:`, err.message);
        });
      }
    });
  }

  protected removeWorker(worker: PoolWorker): boolean {
    const idx = this.workers.indexOf(worker);
    if (idx === -1) return false;
    this.cleanupWorker(worker);
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

    const timeoutMs = env.SANDBOX_MAX_TIMEOUT;
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
      let rssTimer: ReturnType<typeof setInterval> | undefined;

      const settle = (result: ExecuteResult, opts: { recycleWorker?: boolean } = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (rssTimer) clearInterval(rssTimer);
        worker.rl.removeListener('line', onLine);
        worker.proc.removeListener('exit', onExit);
        const recycleWorker = opts.recycleWorker || this.options.recycleAfterTask;
        if (recycleWorker) {
          this.killAndRespawn(worker);
        }
        resolve(result);
      };

      const onLine = (line: string) => {
        try {
          const result = JSON.parse(line) as ExecuteResult & { workerRecycle?: string };
          const recycleReason = result.workerRecycle;
          delete result.workerRecycle;
          if (recycleReason) {
            serverLogger.warn(
              `${this.tag}: recycling worker ${worker.id} after task result: ${recycleReason}`
            );
          }
          settle(result, { recycleWorker: Boolean(recycleReason) });
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

      // RSS 内存监控（任务执行期间轮询子进程物理内存）
      if (env.SANDBOX_MAX_MEMORY_MB > 0 && worker.proc.pid) {
        const limitMB = env.SANDBOX_MAX_MEMORY_MB + RUNTIME_MEMORY_OVERHEAD_MB;
        rssTimer = setInterval(async () => {
          if (settled) return;
          const rss = await this.getWorkerRSSMB(worker.proc.pid!);
          if (rss !== null && rss > limitMB) {
            this.killAndRespawn(worker);
            settle({
              success: false,
              message: `Memory limit exceeded (RSS: ${Math.round(rss)}MB, limit: ${limitMB}MB)`
            });
          }
        }, RSS_POLL_INTERVAL);
      }

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
      serverLogger.warn(`${this.tag}: worker ${worker.id} ${reason}, replacing`);
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
   * 读取 worker 进程树的物理内存（RSS）。
   *
   * 如果环境变量显式放开 child_process/subprocess 这类能力，用户任务可以创建子进程。
   * 这里只统计 worker 本体会漏掉子进程内存，因此按进程树求和。
   *
   * @param pid worker 进程 ID
   * @returns RSS（MB），失败返回 null
   */
  protected async getWorkerRSSMB(pid: number): Promise<number | null> {
    const pids = [pid, ...this.getDescendantPids(pid)];
    if (pids.length === 0) return null;

    try {
      if (platform() === 'linux') {
        let totalKB = 0;
        for (const currentPid of pids) {
          const rssKB = this.readLinuxRSSKB(currentPid);
          if (rssKB !== null) totalKB += rssKB;
        }
        return totalKB > 0 ? totalKB / 1024 : null;
      }

      // macOS/other: 使用 ps 获取多个 PID 的 RSS（单位 kB），不经过 shell。
      const { stdout } = await execFileAsync(
        'ps',
        ['-o', 'rss=', '-p', pids.join(',')],
        { timeout: 2000 }
      );
      const totalKB = stdout
        .split('\n')
        .map((line) => parseInt(line.trim(), 10))
        .filter((rssKB) => !isNaN(rssKB))
        .reduce((sum, rssKB) => sum + rssKB, 0);
      return totalKB > 0 ? totalKB / 1024 : null;
    } catch {
      // 进程可能已退出，忽略错误
      return null;
    }
  }

  protected readLinuxRSSKB(pid: number): number | null {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
      const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
      return match ? parseInt(match[1], 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * 获取进程树后代 PID，用于内存求和和回收清理。
   *
   * Linux 优先读 /proc，macOS/其他系统退回 pgrep -P；失败时返回已知结果。
   */
  protected getDescendantPids(rootPid: number): number[] {
    const descendants: number[] = [];
    const queue = [rootPid];
    const seen = new Set<number>(queue);

    while (queue.length > 0) {
      const parentPid = queue.shift()!;
      for (const childPid of this.getChildPids(parentPid)) {
        if (seen.has(childPid)) continue;
        seen.add(childPid);
        descendants.push(childPid);
        queue.push(childPid);
      }
    }

    return descendants;
  }

  protected getChildPids(pid: number): number[] {
    if (platform() === 'linux') {
      return this.getLinuxChildPids(pid);
    }

    try {
      const stdout = execFileSync('pgrep', ['-P', String(pid)], {
        encoding: 'utf-8',
        timeout: 1000
      });
      return stdout
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
    } catch {
      return [];
    }
  }

  protected getLinuxChildPids(pid: number): number[] {
    const children = new Set<number>();
    try {
      const taskIds = readdirSync(`/proc/${pid}/task`);
      for (const taskId of taskIds) {
        try {
          const content = readFileSync(`/proc/${pid}/task/${taskId}/children`, 'utf-8');
          for (const child of content.trim().split(/\s+/)) {
            const childPid = Number(child);
            if (Number.isInteger(childPid) && childPid > 0) {
              children.add(childPid);
            }
          }
        } catch {}
      }
    } catch {}
    return [...children];
  }

  /** 从池中移除 worker，kill 进程，并在 ready 时 respawn */
  protected killAndRespawn(worker: PoolWorker): void {
    this.removeWorker(worker);
    if (this.ready) {
      this.spawnWorker().catch((err) => {
        serverLogger.error(`${this.tag}: failed to respawn worker ${worker.id}:`, err.message);
      });
    }
  }

  /**
   * 彻底清理 worker 资源
   * 关闭 readline 接口、移除事件监听器、清空缓冲区、kill 进程
   */
  protected cleanupWorker(worker: PoolWorker): void {
    try {
      // 关闭 readline 接口
      worker.rl.close();
      worker.stderrRl.close();

      // 移除所有事件监听器
      worker.rl.removeAllListeners();
      worker.stderrRl.removeAllListeners();
      worker.proc.removeAllListeners();

      // 清空缓冲区
      worker.stderrBuf = [];

      this.killWorkerProcessTree(worker);
    } catch (err) {
      // 忽略清理错误
    }
  }

  /**
   * 按进程树和进程组清理 worker。
   *
   * 显式放开 child_process/subprocess 后，用户代码可能创建后台子进程。
   * 先杀当前能枚举到的后代，再杀 worker 所在进程组，最后兜底杀 worker PID。
   */
  protected killWorkerProcessTree(worker: PoolWorker): void {
    const pid = worker.proc.pid;
    if (!pid) return;

    const descendantPids = this.getDescendantPids(pid).reverse();
    for (const childPid of descendantPids) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {}
    }

    if (PROCESS_GROUP_SUPPORTED) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (err: any) {
        if (err?.code !== 'ESRCH') {
          serverLogger.warn(
            `${this.tag}: failed to kill process group ${pid}: ${err?.message ?? String(err)}`
          );
        }
      }
    }

    try {
      worker.proc.kill('SIGKILL');
    } catch {}
  }

  /** 格式化 stderr 缓冲区用于错误信息 */
  protected formatStderr(worker: PoolWorker): string {
    return worker.stderrBuf.length > 0 ? ` | stderr: ${worker.stderrBuf.join('\n')}` : '';
  }
}
