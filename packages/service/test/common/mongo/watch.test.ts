import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createResilientChangeStream,
  type ChangeStreamLike,
  type ChangeStreamEvent
} from '@fastgpt/service/common/mongo/watch';
import { createFakeChangeStream, type FakeChangeStream } from '@test/utils/changeStream';

/** 用 100/400ms 的小退避，便于假定时器精确断言重连节奏。 */
const setupWatch = ({
  onChange = vi.fn(),
  onResume,
  createStream
}: {
  onChange?: (change: ChangeStreamEvent) => unknown;
  onResume?: () => unknown;
  createStream?: () => ChangeStreamLike;
} = {}) => {
  const streams: FakeChangeStream[] = [];
  const handle = createResilientChangeStream<ChangeStreamEvent>({
    name: 'unit-test-watch',
    initialRetryDelayMs: 100,
    maxRetryDelayMs: 400,
    createStream:
      createStream ??
      (() => {
        const stream = createFakeChangeStream();
        streams.push(stream);
        return stream;
      }),
    onChange,
    onResume
  });
  return { handle, streams, onChange };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createResilientChangeStream', () => {
  it('重连后继续在新流上派发事件', () => {
    vi.useFakeTimers();
    const { streams, onChange } = setupWatch();

    streams[0].emit('change', { operationType: 'insert' });
    expect(onChange).toHaveBeenCalledTimes(1);

    // 终止性错误：驱动不会自愈，必须由这里重建游标。
    streams[0].emit('error', new Error('terminal error'));
    expect(streams).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(2);

    streams[1].emit('change', { operationType: 'update' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('error 后紧跟 close 只触发一次重连', () => {
    vi.useFakeTimers();
    const { streams } = setupWatch();

    streams[0].emit('error', new Error('terminal error'));
    streams[0].emit('close');
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(2);

    vi.advanceTimersByTime(1000);
    expect(streams).toHaveLength(2);
  });

  it('集合失效（invalidate）时重建游标，且不把该事件交给业务处理', () => {
    vi.useFakeTimers();
    const { streams, onChange } = setupWatch();

    streams[0].emit('change', { operationType: 'invalidate' });
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(2);
  });

  it('退避逐次翻倍，收到事件后重置', () => {
    vi.useFakeTimers();
    const { streams } = setupWatch();

    streams[0].emit('error', new Error('first'));
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(2);

    // 第二次延迟已翻倍到 200ms。
    streams[1].emit('error', new Error('second'));
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(2);
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(3);

    // 健康事件把退避重置回初始值 100ms。
    streams[2].emit('change', { operationType: 'update' });
    streams[2].emit('error', new Error('third'));
    vi.advanceTimersByTime(100);
    expect(streams).toHaveLength(4);
  });

  it('退避不超过上限', () => {
    vi.useFakeTimers();
    const { streams } = setupWatch();

    for (const delay of [100, 200, 400, 400]) {
      streams[streams.length - 1].emit('error', new Error('flapping'));
      vi.advanceTimersByTime(delay);
    }

    expect(streams).toHaveLength(5);
  });

  it('close() 关闭当前流并停止重连，重复调用安全', async () => {
    vi.useFakeTimers();
    const { handle, streams } = setupWatch();

    streams[0].emit('error', new Error('terminal error'));
    await handle.close();
    await handle.close();

    expect(streams[0].close).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(streams).toHaveLength(1);
  });

  it('close() 在无待重连时也关闭当前流', async () => {
    vi.useFakeTimers();
    const { handle, streams } = setupWatch();

    await handle.close();

    expect(streams[0].close).toHaveBeenCalledOnce();
  });

  it('重建游标抛错时按退避继续重试，不抛出异常', () => {
    vi.useFakeTimers();
    let attempts = 0;
    const streams: FakeChangeStream[] = [];
    setupWatch({
      createStream: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('connection unavailable');
        const stream = createFakeChangeStream();
        streams.push(stream);
        return stream;
      }
    });

    expect(attempts).toBe(1);
    vi.advanceTimersByTime(100);
    expect(attempts).toBe(2);
    expect(streams).toHaveLength(1);
  });

  it('只在重连时调用 onResume，首次建流不调用', () => {
    vi.useFakeTimers();
    const onResume = vi.fn();
    const { streams } = setupWatch({ onResume });

    expect(onResume).not.toHaveBeenCalled();

    streams[0].emit('error', new Error('terminal error'));
    vi.advanceTimersByTime(100);

    expect(onResume).toHaveBeenCalledOnce();
  });

  it('业务处理函数同步抛错或 reject 都不影响流存活', async () => {
    vi.useFakeTimers();
    const onChange = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('sync handler failure');
      })
      .mockImplementationOnce(() => Promise.reject(new Error('async handler failure')));
    const { streams } = setupWatch({ onChange });

    streams[0].emit('change', { operationType: 'insert' });
    streams[0].emit('change', { operationType: 'insert' });
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(1000);
    expect(streams).toHaveLength(1);
  });
});
