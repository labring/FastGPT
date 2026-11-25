import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import {
  getSandboxDiskUsage,
  invalidateIdeAgentPasswordCache
} from '@fastgpt/service/core/ai/sandbox/application/ideAgent';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySource: vi.fn(),
  countActiveSandboxInstances: vi.fn(),
  getAgentSandboxCommonConfig: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>();
  return {
    ...actual,
    getAgentSandboxCommonConfig: mocks.getAgentSandboxCommonConfig
  };
});

import {
  assertSandboxWorkspaceWritable,
  checkSandboxQuota,
  formatAgentDiskQuotaNotice,
  getSandboxDiskQuotaStatus
} from '@fastgpt/service/core/ai/sandbox/application/quota';

const identity = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  teamId: 'team-1',
  current: null
};

describe('checkSandboxQuota', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.countActiveSandboxInstances.mockResolvedValue(0);
    mocks.getAgentSandboxCommonConfig.mockReturnValue({
      maxEditDebug: 10,
      maxPerTeam: 5
    });
  });

  it('skips quota checks for active instances even when quotas are full', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue({
      status: 'running',
      teamId: identity.teamId
    });
    mocks.countActiveSandboxInstances.mockResolvedValue(100);
    await expect(
      checkSandboxQuota({
        ...identity,
        current: { status: 'running', teamId: identity.teamId } as any
      })
    ).resolves.toBeUndefined();
    expect(mocks.countActiveSandboxInstances).not.toHaveBeenCalled();
  });

  it('checks system quota then team quota using the prepared team id', async () => {
    await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[], [{ teamId: 'team-1' }]]);
  });

  it('rejects when system or team limit is reached', async () => {
    // 系统配额满：直接拒绝且不检查团队配额
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(10);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxLimitReached
    });
    expect(mocks.countActiveSandboxInstances).toHaveBeenCalledTimes(1);

    // 团队配额满：系统通过后被团队配额拦截
    mocks.countActiveSandboxInstances.mockReset();
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxTeamLimitReached
    });
  });

  it('skips team quota query when maxPerTeam is null', async () => {
    mocks.getAgentSandboxCommonConfig.mockReturnValue({
      maxEditDebug: 10,
      maxPerTeam: null
    });
    await checkSandboxQuota(identity);
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[]]);
  });

  it('applies live snapshot quota changes, including zero and nullable team limits', async () => {
    const actual = await vi.importActual<typeof import('@fastgpt/service/core/ai/sandbox/config')>(
      '@fastgpt/service/core/ai/sandbox/config'
    );
    mocks.getAgentSandboxCommonConfig.mockImplementation(actual.getAgentSandboxCommonConfig);
    const original = global.systemInstanceConfig;
    try {
      global.systemInstanceConfig = createDefaultInstanceConfig();
      const common = getTestInstanceConfig().subservice.agentSandbox.common;
      common.maxEditDebug = 10;
      common.maxPerTeam = 1;
      mocks.countActiveSandboxInstances.mockResolvedValue(1);
      await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
        message: SandboxErrEnum.agentSandboxTeamLimitReached
      });
      common.maxPerTeam = 2;
      await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
      common.maxPerTeam = null;
      mocks.countActiveSandboxInstances.mockClear();
      await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
      expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[]]);
      common.maxEditDebug = 0;
      mocks.countActiveSandboxInstances.mockResolvedValue(0);
      await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
        message: SandboxErrEnum.agentSandboxLimitReached
      });
    } finally {
      global.systemInstanceConfig = original;
    }
  });
});

describe('docker disk soft-limit quota', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  const createMockSandbox = (id = 'sbx-disk-1') =>
    ({
      id,
      getEndpoint: vi.fn(async () => ({
        url: '127.0.0.1:1319',
        protocol: 'http',
        headers: { 'x-proxy': '1' }
      })),
      readFiles: vi.fn(async () => [{ content: Buffer.from('secret-token-1'), error: null }])
    }) as any;

  beforeEach(() => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    invalidateIdeAgentPasswordCache();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    invalidateIdeAgentPasswordCache();
    global.systemInstanceConfig = createDefaultInstanceConfig();
  });

  it('skips probing completely on kubernetes runtime', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'kubernetes';
    const sandbox = createMockSandbox();

    await expect(getSandboxDiskQuotaStatus(sandbox)).resolves.toMatchObject({
      enabled: false,
      exceeded: false
    });
    await expect(assertSandboxWorkspaceWritable(sandbox)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces docker volume soft limit, formats agent notices, and fails open on probe errors', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 1;
    const limitBytes = 1024 * 1024 * 1024;
    const sandbox = createMockSandbox('sbx-docker-quota');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ usedBytes: limitBytes + 64 * 1024 * 1024, limitBytes }), {
        status: 200
      })
    );
    await expect(assertSandboxWorkspaceWritable(sandbox)).rejects.toThrowError(
      new UserError(SandboxErrEnum.agentSandboxDiskQuotaExceeded)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1319/disk-usage',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-proxy': '1',
          'x-fastgpt-agent-token': 'secret-token-1'
        })
      })
    );

    const writeNotice = formatAgentDiskQuotaNotice(
      { usedBytes: limitBytes + 1, limitBytes },
      'write'
    );
    expect(writeNotice).toContain('Sandbox disk quota exceeded');
    expect(writeNotice).toContain('sandbox_shell');
    expect(writeNotice).toContain('RLIMIT_FSIZE=0');
    expect(writeNotice).toContain('Do NOT delete files automatically');
    expect(writeNotice).toContain('ask for their confirmation');

    const shellNotice = formatAgentDiskQuotaNotice(
      { usedBytes: limitBytes + 1, limitBytes },
      'shell'
    );
    expect(shellNotice).toContain('read/delete-only mode');
    expect(shellNotice).toContain('/home/sandbox');
    expect(shellNotice).toContain('Do NOT delete files automatically');

    // 探针失败时 fail-open 放行。
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(getSandboxDiskQuotaStatus(sandbox)).resolves.toMatchObject({
      enabled: true,
      exceeded: false
    });
  });

  it('uses container effective limitBytes over live instance config so API and IDE agree on reused containers', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    const gib = 1024 * 1024 * 1024;
    const usedBytes = Math.round(1.2 * gib);
    const sandbox = createMockSandbox('sbx-docker-reused');

    // 容器按 1 GiB 创建，管理员随后调大到 2 GiB：复用旧容器时仍应按容器的 1 GiB 拒绝，与 IDE 保持一致。
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 2;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ usedBytes, limitBytes: gib }), { status: 200 })
    );
    await expect(getSandboxDiskQuotaStatus(sandbox)).resolves.toEqual({
      enabled: true,
      exceeded: true,
      usedBytes,
      limitBytes: gib
    });

    // 容器按 2 GiB 创建，管理员随后调小到 1 GiB：复用旧容器时仍应按容器的 2 GiB 放行，与 IDE 保持一致。
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 1;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ usedBytes, limitBytes: 2 * gib }), { status: 200 })
    );
    await expect(getSandboxDiskQuotaStatus(sandbox)).resolves.toEqual({
      enabled: true,
      exceeded: false,
      usedBytes,
      limitBytes: 2 * gib
    });

    // 探针未返回有效 limitBytes 时回退到当前实例配置。
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ usedBytes, limitBytes: null }), { status: 200 })
    );
    await expect(getSandboxDiskQuotaStatus(sandbox)).resolves.toEqual({
      enabled: true,
      exceeded: true,
      usedBytes,
      limitBytes: gib
    });
  });

  it('refreshes ide-agent password once on 401 in getSandboxDiskUsage', async () => {
    const sandbox = createMockSandbox('sbx-disk-401');
    sandbox.readFiles
      .mockResolvedValueOnce([{ content: Buffer.from('stale-token'), error: null }])
      .mockResolvedValueOnce([{ content: Buffer.from('fresh-token'), error: null }]);
    fetchMock
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ usedBytes: 4096, limitBytes: 8192 }), { status: 200 })
      );

    await expect(getSandboxDiskUsage({ sandbox, refresh: true })).resolves.toEqual({
      usedBytes: 4096,
      limitBytes: 8192
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1319/disk-usage?refresh=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-fastgpt-agent-token': 'fresh-token' })
      })
    );
  });
});
