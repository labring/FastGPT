import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  evalScript: vi.fn()
}));

const leaseMock = vi.hoisted(() => ({ acquireSandboxRedisLease: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  acquireSandboxRedisLease: leaseMock.acquireSandboxRedisLease
}));

vi.mock('@fastgpt/dal/redis/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis/adapter')>()),
  redisCacheAdapter: redisMock
}));

import {
  DEFAULT_SANDBOX_PTY_COMMAND,
  ensureSandboxPtySession,
  resolveVerifiedSandboxPtySession
} from '@fastgpt/service/core/ai/sandbox/application/pty';

describe('sandbox PTY application', () => {
  const ptySessionId = 'pty-1';

  beforeEach(() => {
    vi.resetAllMocks();
    redisMock.get.mockResolvedValue(JSON.stringify({ ptySessionId }));
    redisMock.set.mockResolvedValue(undefined);
    redisMock.delete.mockResolvedValue(true);
    redisMock.evalScript.mockResolvedValue(1);
    let creationQueue = Promise.resolve<unknown>(undefined);
    leaseMock.acquireSandboxRedisLease.mockImplementation((options) => {
      const task = creationQueue.then(() =>
        options.fn({
          assertValid: vi.fn(),
          signal: new AbortController().signal
        })
      );
      creationQueue = task.catch(() => undefined);
      return task;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates or reuses an execd PTY session via Server Proxy endpoint', async () => {
    const sandbox = {
      getSandboxId: () => 'skilledit-1234567890abcdef',
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      }),
      opensandbox: {
        createDirectories: vi.fn().mockResolvedValue(undefined),
        getEndpoint: vi.fn().mockResolvedValue({
          host: 'opensandbox.local',
          port: 44772,
          protocol: 'http',
          url: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
          headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' }
        })
      }
    } as any;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'pty-session-1' })
    });

    redisMock.get.mockResolvedValue(null);
    const created = await ensureSandboxPtySession(sandbox, {
      cols: 120,
      rows: 36,
      fetchImpl: fetchMock as any
    });
    expect(created).toEqual({
      ptySessionId: 'pty-session-1',
      httpBaseUrl: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
      headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' },
      reused: false
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772/pty',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cwd: '/workspace',
          command: DEFAULT_SANDBOX_PTY_COMMAND,
          cols: 120,
          rows: 36
        })
      })
    );

    // 若缓存的会话已退出（running: false），应先 DELETE 清理旧会话再创建新会话
    redisMock.get.mockResolvedValue(JSON.stringify({ ptySessionId: 'pty-exited-1' }));
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-exited-1', running: false, output_offset: 128 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-exited-1', running: false })
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-session-2' })
      });

    const recreated = await ensureSandboxPtySession(sandbox, {
      fetchImpl: fetchMock as any
    });
    expect(recreated.ptySessionId).toBe('pty-session-2');
    expect(recreated.reused).toBe(false);
    expect(recreated.httpBaseUrl).toBe('http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772/pty/pty-exited-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(redisMock.evalScript).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: ['sandbox:pty:state:skilledit-1234567890abcdef'],
        args: [
          JSON.stringify({ ptySessionId: 'pty-exited-1' }),
          JSON.stringify({ ptySessionId: 'pty-session-2' }),
          3600
        ]
      })
    );
  });

  it('serializes concurrent initial PTY creation so both callers attach to the same shell', async () => {
    const sandbox = {
      getSandboxId: () => 'skilledit-concurrent-1',
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      }),
      opensandbox: {
        createDirectories: vi.fn().mockResolvedValue(undefined),
        getEndpoint: vi.fn().mockResolvedValue({
          host: 'opensandbox.local',
          port: 44772,
          protocol: 'http',
          url: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
          headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' }
        })
      }
    } as any;

    let storedState: string | null = null;
    redisMock.get.mockImplementation(async () => storedState);
    redisMock.evalScript.mockImplementation(async ({ script, args }) => {
      if (script.includes('SET')) {
        const current = storedState ?? '';
        if (current !== args[0] && current !== '') return 0;
        storedState = String(args[1]);
        return 1;
      }
      if (script.includes('EXPIRE')) {
        return storedState === JSON.stringify({ ptySessionId: args[0] }) ? 1 : 0;
      }
      return 1;
    });

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ session_id: 'pty-shared-1' })
        };
      }
      return {
        ok: true,
        json: async () => ({ session_id: 'pty-shared-1', running: true })
      };
    });

    const [first, second] = await Promise.all([
      ensureSandboxPtySession(sandbox, { fetchImpl: fetchMock as any }),
      ensureSandboxPtySession(sandbox, { fetchImpl: fetchMock as any })
    ]);

    expect(first.ptySessionId).toBe('pty-shared-1');
    expect(first.reused).toBe(false);
    expect(second.ptySessionId).toBe('pty-shared-1');
    expect(second.reused).toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('succeeds when previous PTY state key naturally expires in Redis during slow-path recreation', async () => {
    const sandbox = {
      getSandboxId: () => 'skilledit-ttl-expired',
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      }),
      opensandbox: {
        createDirectories: vi.fn().mockResolvedValue(undefined),
        getEndpoint: vi.fn().mockResolvedValue({
          host: 'opensandbox.local',
          port: 44772,
          protocol: 'http',
          url: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
          headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' }
        })
      }
    } as any;

    let storedState: string | null = JSON.stringify({ ptySessionId: 'pty-exited-old' });
    redisMock.get.mockImplementation(async () => {
      const value = storedState;
      if (redisMock.get.mock.calls.length >= 2) {
        storedState = null;
      }
      return value;
    });
    redisMock.evalScript.mockImplementation(async ({ script, args }) => {
      if (script.includes("current ~= ''")) {
        const current = storedState ?? '';
        if (current !== args[0] && current !== '') return 0;
        storedState = String(args[1]);
        return 1;
      }
      return 0;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-exited-old', running: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-exited-old', running: false })
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-fresh-after-ttl' })
      });

    const created = await ensureSandboxPtySession(sandbox, { fetchImpl: fetchMock as any });
    expect(created.ptySessionId).toBe('pty-fresh-after-ttl');
    expect(created.reused).toBe(false);
    expect(storedState).toBe(JSON.stringify({ ptySessionId: 'pty-fresh-after-ttl' }));
  });

  it('cleans up the newly created remote PTY if publishing the Redis binding fails', async () => {
    const sandbox = {
      getSandboxId: () => 'skilledit-publish-fail',
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      }),
      opensandbox: {
        createDirectories: vi.fn().mockResolvedValue(undefined),
        getEndpoint: vi.fn().mockResolvedValue({
          host: 'opensandbox.local',
          port: 44772,
          protocol: 'http',
          url: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
          headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' }
        })
      }
    } as any;

    redisMock.get.mockResolvedValue(null);
    redisMock.evalScript.mockImplementation(async ({ script }) => (script.includes('SET') ? 0 : 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'pty-orphan-1' })
      })
      .mockResolvedValueOnce({ ok: true });

    await expect(ensureSandboxPtySession(sandbox, { fetchImpl: fetchMock as any })).rejects.toThrow(
      'Sandbox PTY session binding changed'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772/pty/pty-orphan-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('fast-paths resolveVerifiedSandboxPtySession on active Redis binding and falls back when expired', async () => {
    const createDirectories = vi.fn().mockResolvedValue(undefined);
    const sandbox = {
      getSandboxId: () => 'skilledit-verify-fastpath',
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      }),
      opensandbox: {
        createDirectories,
        getEndpoint: vi.fn().mockResolvedValue({
          host: 'opensandbox.local',
          port: 44772,
          protocol: 'http',
          url: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772/',
          headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' }
        })
      }
    } as any;
    const fetchMock = vi.fn();

    // 1. Active Redis binding -> skips mkdir and GET /pty/<id>
    redisMock.evalScript.mockResolvedValueOnce(1);
    const fast = await resolveVerifiedSandboxPtySession({
      sandbox,
      expectedPtySessionId: 'pty-expected-1',
      fetchImpl: fetchMock as any
    });
    expect(fast).toEqual({
      ptySessionId: 'pty-expected-1',
      httpBaseUrl: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
      headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' },
      reused: true
    });
    expect(createDirectories).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    // 2. Expired Redis binding -> falls back to ensureSandboxPtySession and marks reused=false for new session
    redisMock.evalScript.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    redisMock.get.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'pty-recreated-2' })
    });
    const fallback = await resolveVerifiedSandboxPtySession({
      sandbox,
      expectedPtySessionId: 'pty-expected-1',
      fetchImpl: fetchMock as any
    });
    expect(fallback).toEqual({
      ptySessionId: 'pty-recreated-2',
      httpBaseUrl: 'http://opensandbox.local/v1/sandboxes/sbx-1/proxy/44772',
      headers: { 'OPEN-SANDBOX-API-KEY': 'secret-key' },
      reused: false
    });
    expect(createDirectories).toHaveBeenCalledWith(['/workspace']);
  });
});
