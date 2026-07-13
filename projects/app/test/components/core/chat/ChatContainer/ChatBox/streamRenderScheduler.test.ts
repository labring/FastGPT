import { describe, expect, it, vi } from 'vitest';
import {
  createStreamRenderScheduler,
  STREAM_RENDER_INTERVAL_MS,
  type StreamRenderSchedulerRuntime
} from '@/components/core/chat/ChatContainer/ChatBox/utils/streamRenderScheduler';

const createFakeRuntime = () => {
  let now = 100;
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const frames = new Map<number, () => void>();

  const runtime: StreamRenderSchedulerRuntime = {
    now: () => now,
    setTimer: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    }
  };

  return {
    runtime,
    timers,
    frames,
    setNow: (value: number) => {
      now = value;
    },
    runNextTimer: () => {
      const entry = timers.entries().next().value as
        | [number, { callback: () => void; delay: number }]
        | undefined;
      if (!entry) throw new Error('No timer scheduled');

      timers.delete(entry[0]);
      entry[1].callback();
    },
    runNextFrame: () => {
      const entry = frames.entries().next().value as [number, () => void] | undefined;
      if (!entry) throw new Error('No frame scheduled');

      frames.delete(entry[0]);
      entry[1]();
    }
  };
};

describe('createStreamRenderScheduler', () => {
  it('should align the first flush to the next frame without waiting a full interval', () => {
    const fake = createFakeRuntime();
    const onFlush = vi.fn();
    const scheduler = createStreamRenderScheduler({ onFlush, runtime: fake.runtime });

    scheduler.schedule();

    expect([...fake.timers.values()].map((item) => item.delay)).toEqual([0]);
    fake.runNextTimer();
    expect(fake.frames).toHaveLength(1);
    fake.runNextFrame();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('should coalesce schedules and wait until 50ms after the previous flush', () => {
    const fake = createFakeRuntime();
    const onFlush = vi.fn();
    const scheduler = createStreamRenderScheduler({ onFlush, runtime: fake.runtime });

    scheduler.schedule();
    scheduler.schedule();
    expect(fake.timers).toHaveLength(1);
    fake.runNextTimer();
    fake.runNextFrame();

    fake.setNow(110);
    scheduler.schedule();
    scheduler.schedule();

    expect([...fake.timers.values()].map((item) => item.delay)).toEqual([
      STREAM_RENDER_INTERVAL_MS - 10
    ]);
    fake.setNow(150);
    fake.runNextTimer();
    fake.runNextFrame();
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it('should flush immediately and cancel pending work', () => {
    const fake = createFakeRuntime();
    const onFlush = vi.fn();
    const scheduler = createStreamRenderScheduler({ onFlush, runtime: fake.runtime });

    scheduler.schedule();
    scheduler.flush();

    expect(fake.timers).toHaveLength(0);
    expect(fake.frames).toHaveLength(0);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('should cancel pending work without flushing', () => {
    const fake = createFakeRuntime();
    const onFlush = vi.fn();
    const scheduler = createStreamRenderScheduler({ onFlush, runtime: fake.runtime });

    scheduler.schedule();
    fake.runNextTimer();
    scheduler.cancel();

    expect(fake.timers).toHaveLength(0);
    expect(fake.frames).toHaveLength(0);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('should not schedule another timer while a frame is pending', () => {
    const fake = createFakeRuntime();
    const scheduler = createStreamRenderScheduler({ onFlush: vi.fn(), runtime: fake.runtime });

    scheduler.schedule();
    fake.runNextTimer();
    scheduler.schedule();

    expect(fake.timers).toHaveLength(0);
    expect(fake.frames).toHaveLength(1);
  });

  it('should use the browser runtime by default', () => {
    let timerCallback: (() => void) | undefined;
    let frameCallback: (() => void) | undefined;
    const setTimeout = vi.fn((callback: () => void) => {
      timerCallback = callback;
      return 1;
    });
    const clearTimeout = vi.fn();
    const requestAnimationFrame = vi.fn((callback: () => void) => {
      frameCallback = callback;
      return 2;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      requestAnimationFrame,
      cancelAnimationFrame
    });
    const onFlush = vi.fn();
    const scheduler = createStreamRenderScheduler({ onFlush });

    scheduler.schedule();
    timerCallback?.();
    frameCallback?.();
    scheduler.schedule();
    scheduler.flush();
    scheduler.schedule();
    timerCallback?.();
    scheduler.cancel();

    expect(setTimeout).toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(clearTimeout).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(onFlush).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
