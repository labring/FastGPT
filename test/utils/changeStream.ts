import { vi } from 'vitest';
import type { ChangeStreamLike } from '@fastgpt/service/common/mongo/watch';

export type FakeChangeStream = ChangeStreamLike & {
  /** 触发指定事件，用于模拟驱动的 change / error / close 事件。 */
  emit: (event: string, ...args: unknown[]) => void;
  close: ReturnType<typeof vi.fn>;
};

/**
 * 构造 change stream 测试替身：记录监听器并可手动触发事件。
 * 真实驱动只有在挂了 change 监听后才会进入事件模式，这里保持同样的宽松语义。
 */
export const createFakeChangeStream = (): FakeChangeStream => {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const stream: FakeChangeStream = {
    close: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return stream;
    }),
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    }
  };

  return stream;
};
