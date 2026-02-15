import { spawn, type ChildProcess } from 'child_process';
import type { PoolConfig, PooledProcess } from '../types';

/**
 * 创建一个池化进程包装
 */
function createPooledProcess(proc: ChildProcess): PooledProcess {
  return {
    proc,
    useCount: 0,
    lastUsed: Date.now(),
    isAlive() {
      return !proc.killed && proc.exitCode === null;
    },
    kill() {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }
  };
}

/**
 * ProcessPool - 进程池
 *
 * 预热一批空闲进程等待任务，减少请求延迟。
 * 支持：
 * - 自动补充到目标池大小
 * - 空闲超时清理
 * - 最大复用次数限制（防内存泄漏）
 * - 优雅关闭
 */
export class ProcessPool {
  private idle: PooledProcess[] = [];
  private busy = new Set<PooledProcess>();
  private poolConfig: PoolConfig;
  private spawnFn: () => ChildProcess;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(poolConfig: PoolConfig, spawnFn: () => ChildProcess) {
    this.poolConfig = poolConfig;
    this.spawnFn = spawnFn;

    // 预热：启动 poolSize 个进程
    for (let i = 0; i < poolConfig.poolSize; i++) {
      this.idle.push(createPooledProcess(this.spawnFn()));
    }

    // 定期清理空闲超时的进程（30s 一次）
    this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
  }

  /** 从池中获取一个进程 */
  acquire(): PooledProcess {
    if (this.closed) {
      throw new Error('ProcessPool is closed');
    }

    // 优先从池中取一个存活的进程
    while (this.idle.length > 0) {
      const proc = this.idle.pop()!;
      if (proc.isAlive()) {
        this.busy.add(proc);
        return proc;
      }
      // 已死亡，丢弃
      proc.kill();
    }

    // 池空，临时创建
    const newProc = createPooledProcess(this.spawnFn());
    this.busy.add(newProc);
    return newProc;
  }

  /** 归还进程到池中 */
  release(pooledProc: PooledProcess): void {
    this.busy.delete(pooledProc);
    pooledProc.useCount++;

    if (
      this.closed ||
      pooledProc.useCount >= this.poolConfig.maxRecycle ||
      !pooledProc.isAlive()
    ) {
      // 超过复用次数、已死亡或池已关闭 → 销毁
      pooledProc.kill();
      // 如果池未关闭且空闲不足，补充新进程
      if (!this.closed && this.idle.length < this.poolConfig.poolSize) {
        this.idle.push(createPooledProcess(this.spawnFn()));
      }
    } else {
      // 放回池中
      pooledProc.lastUsed = Date.now();
      this.idle.push(pooledProc);
    }
  }

  /** 清理空闲超时的进程，并补充到目标池大小 */
  private cleanup(): void {
    if (this.closed) return;

    const now = Date.now();
    this.idle = this.idle.filter((proc) => {
      if (!proc.isAlive() || now - proc.lastUsed > this.poolConfig.maxIdleMs) {
        proc.kill();
        return false;
      }
      return true;
    });

    // 补充到目标池大小
    while (this.idle.length < this.poolConfig.poolSize) {
      this.idle.push(createPooledProcess(this.spawnFn()));
    }
  }

  /** 优雅关闭：终止所有进程 */
  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const proc of [...this.idle, ...this.busy]) {
      proc.kill();
    }
    this.idle = [];
    this.busy.clear();
  }

  /** 当前池状态（用于健康检查） */
  get stats() {
    return {
      idle: this.idle.length,
      busy: this.busy.size,
      target: this.poolConfig.poolSize
    };
  }
}
