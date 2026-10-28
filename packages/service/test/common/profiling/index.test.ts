import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProfilePayload = {
  kind: string;
  toolName?: string;
  ok: boolean;
  error?: string;
  totalMs: number;
  stages: Record<string, { n: number; ms: number; params?: Record<string, unknown>[] }>;
  mongo: { ops: number; ms: number; top: Record<string, number> };
  inflight: number;
  cpuMs: number;
  elu: number;
  meta?: Record<string, unknown>;
};

type ProfilingModule = typeof import('@fastgpt/service/common/profiling');
let loggerMocks: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
let recordMetric: ReturnType<typeof vi.fn>;
let profiling: ProfilingModule;

const getLastPayload = (): ProfilePayload => {
  const lastCall = loggerMocks.info.mock.calls.at(-1);
  expect(lastCall).toBeDefined();

  const message = String(lastCall![0]);
  const json = message
    .replace(/^Request profile /, '')
    .replaceAll('{{', '{')
    .replaceAll('}}', '}');

  return JSON.parse(json) as ProfilePayload;
};

// profiler 会被 common/mongo 在 setup 阶段提前加载，必须先重置模块注册表再注入 mock。
beforeEach(async () => {
  vi.resetModules();
  loggerMocks = { info: vi.fn(), warn: vi.fn() };
  recordMetric = vi.fn();

  vi.doMock('@fastgpt/service/common/logger', () => ({
    getLogger: () => ({
      info: loggerMocks.info,
      warn: loggerMocks.warn
    }),
    LogCategories: {
      REQUEST: {
        PROFILE: ['request', 'profile']
      }
    }
  }));
  vi.doMock('@fastgpt/service/common/metrics', () => ({
    getMeter: () => ({ createHistogram: () => ({ record: recordMetric }) })
  }));

  profiling = await import('@fastgpt/service/common/profiling');
});

afterEach(() => {
  vi.doUnmock('@fastgpt/service/common/logger');
  vi.doUnmock('@fastgpt/service/common/metrics');
  vi.resetModules();
});

describe('withRequestProfile', () => {
  it('输出一次汇总，包含阶段、Mongo 与 meta', async () => {
    await profiling.withRequestProfile({ kind: 'tools/call', toolName: 'search' }, async () => {
      expect(profiling.isProfiling()).toBe(true);

      await profiling.profileStage({ event: 'mcpKey.read' }, async () => undefined);
      await profiling.profileStage({ event: 'app.list' }, async () => undefined);
      await profiling.profileStage({ event: 'app.list' }, async () => undefined);

      profiling.recordMongoOperation({ collectionName: 'apps', durationMs: 3 });
      profiling.recordMongoOperation({ collectionName: 'apps', durationMs: 2 });
      profiling.recordMongoOperation({ collectionName: 'app_versions', durationMs: 5 });
      profiling.recordMongoOperation({ durationMs: 1 });

      profiling.setProfileMeta({ appId: 'app-1', nodeCount: 12 });
    });

    expect(loggerMocks.info).toHaveBeenCalledTimes(1);

    const payload = getLastPayload();
    expect(payload.kind).toBe('tools/call');
    expect(payload.toolName).toBe('search');
    expect(payload.ok).toBe(true);
    expect(payload.stages['mcpKey.read'].n).toBe(1);
    expect(payload.stages['app.list'].n).toBe(2);
    expect(payload.mongo.ops).toBe(4);
    expect(payload.mongo.ms).toBe(11);
    expect(payload.mongo.top).toEqual({ apps: 2, app_versions: 1 });
    expect(payload.meta).toEqual({ appId: 'app-1', nodeCount: 12 });
    expect(typeof payload.inflight).toBe('number');
    expect(typeof payload.totalMs).toBe('number');
    expect(typeof payload.cpuMs).toBe('number');
    expect(typeof payload.elu).toBe('number');
  });

  it('嵌套调用不重复计数', async () => {
    await profiling.withRequestProfile({ kind: 'tools/call' }, async () => {
      await profiling.withRequestProfile({ kind: 'tools/list' }, async () => undefined);
    });

    expect(loggerMocks.info).toHaveBeenCalledTimes(1);
    expect(getLastPayload().kind).toBe('tools/call');
  });

  it('异常时仍输出汇总并原样抛出', async () => {
    await expect(
      profiling.withRequestProfile({ kind: 'tools/call', toolName: 'demo' }, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(loggerMocks.info).toHaveBeenCalledTimes(1);

    const payload = getLastPayload();
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('boom');
  });

  it.each([
    { code: 500 },
    Object.defineProperty({}, 'message', {
      get() {
        throw new Error('unreadable error');
      }
    })
  ])('异常摘要不可读时仍抛出原始业务错误：%j', async (error) => {
    await expect(
      profiling.withRequestProfile({ kind: 'test' }, async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(getLastPayload()).toMatchObject({ ok: false });
  });

  it('已处理异常的摘要提取失败时不打断业务', async () => {
    await expect(
      profiling.withRequestProfile({ kind: 'test' }, async () => {
        profiling.markProfileError({ code: 500 });
        return 'result';
      })
    ).resolves.toBe('result');
    expect(getLastPayload()).toMatchObject({ ok: false });
  });

  it('允许业务代码标记已处理的失败，并保留第一个错误', async () => {
    await profiling.withRequestProfile({ kind: 'chat' }, async () => {
      profiling.markProfileError(new Error('auth failed'));
      profiling.markProfileError(new Error('cleanup failed'));
    });

    const payload = getLastPayload();
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('auth failed');
  });

  it('允许只标记失败状态而不附带错误文本', async () => {
    await profiling.withRequestProfile({ kind: 'chat' }, async () => {
      profiling.markProfileError();
    });

    const payload = getLastPayload();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBeUndefined();
  });

  it('没有 profile 上下文时标记失败是空操作', () => {
    expect(() => profiling.markProfileError('ignored')).not.toThrow();
    profiling.setProfileMeta({ ignored: true });
    profiling.recordMongoOperation({ durationMs: 1 });
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('隔离并发请求的阶段、参数和失败状态，退出后清理上下文', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = profiling.withRequestProfile({ kind: 'first' }, async () => {
      await profiling.profileStage(
        { event: 'tools.authorize', params: { teamId: 'a' } },
        () => pending
      );
    });
    await profiling.withRequestProfile({ kind: 'second' }, async () => {
      profiling.markProfileError('second failed');
      await profiling.profileStage({ event: 'tools.authorize', params: { teamId: 'b' } }, () => 1);
    });
    expect(getLastPayload()).toMatchObject({
      kind: 'second',
      ok: false,
      stages: { 'tools.authorize': { n: 1, params: [{ teamId: 'b' }] } }
    });
    release();
    await first;
    expect(getLastPayload()).toMatchObject({
      kind: 'first',
      ok: true,
      stages: { 'tools.authorize': { n: 1, params: [{ teamId: 'a' }] } }
    });
    expect(profiling.isProfiling()).toBe(false);
    expect(loggerMocks.info).toHaveBeenCalledTimes(2);
  });

  it('日志上报失败不改变业务结果', async () => {
    loggerMocks.info.mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    await expect(
      profiling.withRequestProfile({ kind: 'test' }, async () => 'result')
    ).resolves.toBe('result');
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Failed to write request profile log',
      expect.any(Object)
    );
  });

  it('指标上报和兜底日志均失败时仍保留业务结果', async () => {
    recordMetric.mockImplementation(() => {
      throw new Error('metrics unavailable');
    });
    loggerMocks.warn.mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    await expect(
      profiling.withRequestProfile({ kind: 'test' }, async () => 'result')
    ).resolves.toBe('result');
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Failed to record request profile metrics',
      expect.any(Object)
    );
  });
});

describe('profileStage', () => {
  it('没有上下文时直接执行回调', async () => {
    const result = await profiling.profileStage({ event: 'noop' }, async () => 'value');

    expect(result).toBe('value');
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('同名 event 累计次数和耗时，并分别保留额外参数', async () => {
    await profiling.withRequestProfile({ kind: 'test' }, async () => {
      expect(
        await profiling.profileStage({ event: 'tools.authorize', params: { toolCount: 2 } }, () => [
          'a',
          'b'
        ])
      ).toEqual(['a', 'b']);
      await profiling.profileStage({ event: 'tools.authorize' }, async () => undefined);
      await profiling.profileStage({ event: 'tools.authorize', params: { toolCount: 0 } }, () => 0);
    });
    expect(getLastPayload().stages['tools.authorize']).toEqual({
      n: 3,
      ms: expect.any(Number),
      params: [{ toolCount: 2 }, { toolCount: 0 }]
    });
    expect(recordMetric).toHaveBeenCalledWith(expect.any(Number), {
      kind: 'test',
      stage: 'tools.authorize',
      status: 'ok'
    });
    for (const [, attributes] of recordMetric.mock.calls) {
      expect(attributes).not.toHaveProperty('params');
      expect(attributes).not.toHaveProperty('toolCount');
    }
  });

  it('同步异常及 Promise 失败均记录阶段，保留原始错误', async () => {
    const error = new Error('authorize failed');
    await profiling.withRequestProfile({ kind: 'test' }, async () => {
      await expect(
        profiling.profileStage({ event: 'sync' }, () => {
          throw error;
        })
      ).rejects.toBe(error);
      await expect(
        profiling.profileStage({ event: 'async', params: {} }, () => Promise.reject(error))
      ).rejects.toBe(error);
    });
    expect(getLastPayload().stages).toMatchObject({
      sync: { n: 1 },
      async: { n: 1, params: [{}] }
    });
  });
});
