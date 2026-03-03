/**
 * Semaphore - 简单信号量，控制最大并发数
 *
 * 超出并发上限的请求排队等待，避免子进程数爆炸。
 */
export class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  /** 获取许可，超出上限则排队 */
  acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /** 释放许可，唤醒队列中下一个 */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.current--;
    }
  }

  get stats() {
    return { current: this.current, queued: this.queue.length, max: this.max };
  }
}
