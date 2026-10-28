import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { withTiming } from '@fastgpt/service/common/logger/timing';

const loggerMocks = vi.hoisted(() => {
  const logger = { debug: vi.fn(), warn: vi.fn() };
  return { getLogger: vi.fn(() => logger) };
});

vi.mock('@fastgpt/service/common/logger/client', () => ({ getLogger: loggerMocks.getLogger }));

/** 为专用日志工厂提供可观察的输出端，不把业务 Logger 注入计时器。 */
const createLogger = () => {
  const logger = { debug: vi.fn(), warn: vi.fn() };
  loggerMocks.getLogger.mockReturnValue(logger);
  return logger;
};

/** 手动推进异步结果，验证计时从实际调用开始、直到异步完成才结束。 */
const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('withTiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps event, stage and duration owned by the timer when metadata conflicts', () => {
    const logger = createLogger();
    function read() {
      return 0;
    }
    const run = withTiming(
      {
        event: 'test.stage_finished',
        stage: 'tools.merge',
        properties: { event: 'other_event', stage: 'other_stage', durationMs: 9000 },
        summary: () => ({ event: 'summary_event', stage: 'summary_stage', durationMs: 8000 })
      },
      read
    );
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1040);

    expect(run()).toBe(0);
    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
      event: 'test.stage_finished',
      stage: 'tools.merge',
      durationMs: 40
    });
  });

  it('wraps once and preserves sync result identity, arguments and this', () => {
    const logger = createLogger();
    const owner = { tools: ['a', 'b'] };
    function listTools(this: typeof owner, source: string, limit: number) {
      expect(source).toBe('system');
      expect(limit).toBe(2);
      return this.tools;
    }
    const list = withTiming(
      {
        event: 'test.stage_finished',
        stage: 'tools.merge',
        properties: (source, limit) => ({ source, inputCount: limit }),
        summary: (tools) => ({ outputCount: tools.length })
      },
      listTools
    );
    expect(loggerMocks.getLogger).toHaveBeenCalledExactlyOnceWith(['trace', 'test.stage_finished']);
    expect(logger.debug).not.toHaveBeenCalled();
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1040);

    const result = list.call(owner, 'system', 2);

    expectTypeOf(result).toEqualTypeOf<string[]>();
    expect(result).toBe(owner.tools);
    expect(now).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
      event: 'test.stage_finished',
      stage: 'tools.merge',
      source: 'system',
      inputCount: 2,
      outputCount: 2,
      durationMs: 40
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    [999, 'debug'],
    [1000, 'warn']
  ] as const)('logs %ims at %s with no required metadata or result', (durationMs, level) => {
    const logger = createLogger();
    function noop() {}
    const run = withTiming({ event: 'test.stage_finished', stage: 'test' }, noop);
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(durationMs);

    expect(run()).toBeUndefined();

    expect(logger[level]).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
      event: 'test.stage_finished',
      stage: 'test',
      durationMs
    });
    expect(logger[level === 'debug' ? 'warn' : 'debug']).not.toHaveBeenCalled();
  });

  it.each([null, 42, {}, { then: 'not callable' }, () => 'plain function'])(
    'keeps non-thenable values synchronous: %s',
    (value) => {
      const logger = createLogger();
      function read() {
        return value;
      }
      const run = withTiming({ event: 'test.stage_finished', stage: 'test' }, read);
      vi.spyOn(Date, 'now').mockReturnValue(1000);

      expect(run()).toBe(value);
      expect(logger.debug).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
        event: 'test.stage_finished',
        stage: 'test',
        durationMs: 0
      });
    }
  );

  it.each([
    [20, 'debug'],
    [1000, 'warn']
  ] as const)(
    'logs a sync failure after %ims at %s and throws the same error',
    (durationMs, level) => {
      const logger = createLogger();
      const error = new Error('Filtering failed');
      function fail(): never {
        throw error;
      }
      const run = withTiming({ event: 'test.stage_finished', stage: 'tools.filter' }, fail);
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(durationMs);
      let caught: unknown;

      try {
        run();
      } catch (failure) {
        caught = failure;
      }

      expect(caught).toBe(error);
      expect(logger[level]).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
        event: 'test.stage_finished',
        stage: 'tools.filter',
        durationMs,
        failed: true
      });
      expect(logger[level === 'debug' ? 'warn' : 'debug']).not.toHaveBeenCalled();
    }
  );

  it('waits for promises returned by regular functions and summarizes the resolved result', async () => {
    const logger = createLogger();
    const pending = createDeferred<string[]>();
    const tools = ['a', 'b'];
    function load(source: string) {
      expect(source).toBe('system');
      return pending.promise;
    }
    const list = withTiming(
      {
        event: 'test.stage_finished',
        stage: 'plugin.listTools',
        properties: (source) => ({ source }),
        summary: (items) => ({ toolCount: items.length })
      },
      load
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const result = list('system');
    expectTypeOf(result).toEqualTypeOf<Promise<string[]>>();
    expect(logger.debug).not.toHaveBeenCalled();

    now.mockReturnValue(1400);
    pending.resolve(tools);

    await expect(result).resolves.toBe(tools);
    expect(logger.debug).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
      event: 'test.stage_finished',
      stage: 'plugin.listTools',
      source: 'system',
      toolCount: 2,
      durationMs: 400
    });
  });

  it.each([
    [20, 'debug'],
    [1000, 'warn']
  ] as const)(
    'logs a rejected promise after %ims at %s and preserves the error',
    async (durationMs, level) => {
      const logger = createLogger();
      const error = new Error('Plugin timeout');
      async function load(): Promise<never> {
        throw error;
      }
      const run = withTiming({ event: 'test.stage_finished', stage: 'test' }, load);
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(durationMs);

      await expect(run()).rejects.toBe(error);

      expect(logger[level]).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
        event: 'test.stage_finished',
        stage: 'test',
        durationMs,
        failed: true
      });
      expect(logger[level === 'debug' ? 'warn' : 'debug']).not.toHaveBeenCalled();
    }
  );

  it('awaits thenables such as Mongo queries and returns a native promise', async () => {
    const logger = createLogger();
    const tools = ['a'];
    const query: PromiseLike<string[]> = {
      then(onFulfilled, onRejected) {
        return Promise.resolve(tools).then(onFulfilled, onRejected);
      }
    };
    function load() {
      return query;
    }
    const run = withTiming(
      {
        event: 'test.stage_finished',
        stage: 'test',
        summary: (items) => ({ toolCount: items.length })
      },
      load
    );
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1000);

    const result = run();

    expectTypeOf(result).toEqualTypeOf<Promise<string[]>>();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(tools);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('test.stage_finished', {
      event: 'test.stage_finished',
      stage: 'test',
      toolCount: 1,
      durationMs: 1000
    });
  });

  it('isolates timings and metadata when a wrapped function runs concurrently', async () => {
    const logger = createLogger();
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    function load(id: string) {
      return id === 'first' ? first.promise : second.promise;
    }
    const run = withTiming(
      { event: 'test.stage_finished', stage: 'test', properties: (id) => ({ id }) },
      load
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const firstResult = run('first');
    now.mockReturnValue(1100);
    const secondResult = run('second');

    now.mockReturnValue(1400);
    first.resolve('a');
    await expect(firstResult).resolves.toBe('a');
    now.mockReturnValue(1900);
    second.resolve('b');
    await expect(secondResult).resolves.toBe('b');

    expect(logger.debug.mock.calls).toEqual([
      [
        'test.stage_finished',
        { event: 'test.stage_finished', stage: 'test', id: 'first', durationMs: 400 }
      ],
      [
        'test.stage_finished',
        { event: 'test.stage_finished', stage: 'test', id: 'second', durationMs: 800 }
      ]
    ]);
  });
});
