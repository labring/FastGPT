import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createParseTaskLease,
  PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS
} from '@/service/core/dataset/queues/parseLease';

describe('createParseTaskLease', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('按当前 lockTime 条件续租，并将成功后的时间用于下一次续租', async () => {
    const initialLockTime = new Date('2026-07-30T00:00:00.000Z');
    const updateLock = vi.fn().mockResolvedValue(true);
    const lease = createParseTaskLease({
      taskId: 'training-1',
      lockTime: initialLockTime,
      updateLock
    });

    lease.start();
    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS);

    expect(updateLock).toHaveBeenCalledTimes(1);
    const firstCall = updateLock.mock.calls[0];
    expect(firstCall[0]).toEqual({
      _id: 'training-1',
      lockTime: initialLockTime
    });
    expect(firstCall[1]).toBeInstanceOf(Date);

    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS);

    expect(updateLock).toHaveBeenCalledTimes(2);
    expect(updateLock.mock.calls[1][0]).toEqual({
      _id: 'training-1',
      lockTime: firstCall[1]
    });
    expect(lease.getFilter()).toEqual({
      _id: 'training-1',
      lockTime: updateLock.mock.calls[1][1]
    });

    await lease.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('续租条件不匹配时标记 lease 丢失并停止 heartbeat', async () => {
    const initialLockTime = new Date('2026-07-30T00:00:00.000Z');
    const onLost = vi.fn();
    const updateLock = vi.fn().mockResolvedValue(false);
    const lease = createParseTaskLease({
      taskId: 'training-1',
      lockTime: initialLockTime,
      updateLock,
      onLost
    });

    lease.start();
    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS * 2);

    expect(updateLock).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(lease.isLost()).toBe(true);
    expect(lease.getFilter()).toEqual({
      _id: 'training-1',
      lockTime: initialLockTime
    });

    await lease.stop();
  });

  it('heartbeat 更新异常时通知调用方，并在下一轮继续尝试', async () => {
    const error = new Error('temporary mongo error');
    const onError = vi.fn();
    const updateLock = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(true);
    const lease = createParseTaskLease({
      taskId: 'training-1',
      lockTime: new Date('2026-07-30T00:00:00.000Z'),
      updateLock,
      onError
    });

    lease.start();
    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS);

    expect(onError).toHaveBeenCalledWith(error);
    expect(updateLock).toHaveBeenCalledTimes(2);
    expect(lease.isLost()).toBe(false);

    await lease.stop();
  });

  it('停止后不会启动或执行新的 heartbeat', async () => {
    const updateLock = vi.fn().mockResolvedValue(true);
    const lease = createParseTaskLease({
      taskId: 'training-1',
      lockTime: new Date(),
      updateLock,
      intervalMs: 1000
    });

    await lease.heartbeat();
    await lease.stop();
    lease.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(updateLock).toHaveBeenCalledTimes(1);
  });

  it('不会并发执行 heartbeat，并在 stop 时等待当前续租完成', async () => {
    let resolveUpdate: ((renewed: boolean) => void) | undefined;
    const updateLock = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    const lease = createParseTaskLease({
      taskId: 'training-1',
      lockTime: new Date('2026-07-30T00:00:00.000Z'),
      updateLock,
      intervalMs: 1000
    });

    lease.start();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateLock).toHaveBeenCalledTimes(1);

    const stopPromise = lease.stop();
    let stopped = false;
    void stopPromise.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveUpdate?.(true);
    await stopPromise;
    expect(stopped).toBe(true);
  });
});
