import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProfilePayload = {
  kind: string;
  toolName?: string;
  ok: boolean;
  error?: string;
  totalMs: number;
  stages: Record<string, { n: number; ms: number }>;
  mongo: { ops: number; ms: number; top: Record<string, number> };
  inflight: number;
  cpuMs: number;
  elu: number;
  meta?: Record<string, unknown>;
};

type ProfilingModule = typeof import('@fastgpt/service/common/profiling');
type EnvModule = typeof import('@fastgpt/service/env');

let loggerMocks: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
let profiling: ProfilingModule;
let serviceEnv: EnvModule['serviceEnv'];

const getLastPayload = (): ProfilePayload => {
  const lastCall = loggerMocks.info.mock.calls.at(-1);
  expect(lastCall).toBeDefined();

  const message = String(lastCall![0]);
  const json = message
    .replace(/^MCP call profile /, '')
    .replaceAll('{{', '{')
    .replaceAll('}}', '}');

  return JSON.parse(json) as ProfilePayload;
};

// profiler 会被 common/mongo 在 setup 阶段提前加载，必须先重置模块注册表再注入 mock。
beforeEach(async () => {
  vi.resetModules();
  loggerMocks = { info: vi.fn(), warn: vi.fn() };

  vi.doMock('@fastgpt/service/common/logger', () => ({
    getLogger: () => ({
      info: loggerMocks.info,
      warn: loggerMocks.warn
    }),
    LogCategories: {
      MODULE: {
        MCP: {
          PROFILE: ['mcp', 'profile']
        }
      }
    }
  }));

  ({ serviceEnv } = await import('@fastgpt/service/env'));
  profiling = await import('@fastgpt/service/common/profiling');

  serviceEnv.MCP_CALL_PROFILE_ENABLE = true;
  serviceEnv.MCP_CALL_PROFILE_SAMPLE_RATE = 1;
});

afterEach(() => {
  vi.doUnmock('@fastgpt/service/common/logger');
  vi.resetModules();
});

describe('withRequestProfile', () => {
  it('关闭时不创建上下文，也不输出日志', async () => {
    serviceEnv.MCP_CALL_PROFILE_ENABLE = false;

    const result = await profiling.withRequestProfile(
      { kind: 'tools/call', toolName: 'demo' },
      async () => profiling.isProfiling()
    );

    expect(result).toBe(false);
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('采样率为 0 时不采集', async () => {
    serviceEnv.MCP_CALL_PROFILE_SAMPLE_RATE = 0;

    await profiling.withRequestProfile({ kind: 'tools/list' }, async () => undefined);

    expect(loggerMocks.info).not.toHaveBeenCalled();
  });

  it('输出一次汇总，包含阶段、Mongo 与 meta', async () => {
    await profiling.withRequestProfile({ kind: 'tools/call', toolName: 'search' }, async () => {
      expect(profiling.isProfiling()).toBe(true);

      await profiling.profileStage('mcpKey.read', async () => undefined);
      await profiling.profileStage('app.list', async () => undefined);
      await profiling.profileStage('app.list', async () => undefined);

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
});

describe('profileStage', () => {
  it('没有上下文时直接执行回调', async () => {
    const result = await profiling.profileStage('noop', async () => 'value');

    expect(result).toBe('value');
  });
});
