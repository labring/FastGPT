import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getConfiguredSandboxProvider: vi.fn(),
  countDocuments: vi.fn(),
  archiveSandboxResources: vi.fn(),
  sandboxArchiveTrack: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema', () => ({
  MongoSandboxInstance: {
    countDocuments: mocks.countDocuments
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/admin', () => ({
  getConfiguredSandboxProvider: mocks.getConfiguredSandboxProvider,
  archiveSandboxResources: mocks.archiveSandboxResources
}));

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: {
    sandboxArchive: mocks.sandboxArchiveTrack
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger
}));

import handler from '@/pages/api/admin/dataClean/initSandboxArchiveV2';

describe('initSandboxArchiveV2 API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T08:00:00.000Z'));
    mocks.authCert.mockResolvedValue(undefined);
    mocks.getConfiguredSandboxProvider.mockReturnValue('opensandbox');
    mocks.countDocuments.mockResolvedValue(3);
    mocks.archiveSandboxResources.mockResolvedValue({
      total: 3,
      successCount: 2,
      skippedCount: 0,
      failCount: 1,
      failures: [{ sandboxId: 'sandbox-3', error: 'delete failed' }]
    });
    mocks.sandboxArchiveTrack.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('authenticates Root and only counts v2 candidates by default', async () => {
    const req = { body: {} } as any;

    await expect(handler(req)).resolves.toMatchObject({
      archiveTriggered: false,
      archiveCandidateCount: 3,
      archiveResult: null,
      activeProvider: 'opensandbox',
      inactiveBefore: '2026-07-09T08:00:00.000Z'
    });
    expect(mocks.authCert).toHaveBeenCalledWith({ req, authRoot: true });
    expect(mocks.countDocuments).toHaveBeenCalledWith({
      provider: 'opensandbox',
      status: 'stopped',
      lastActiveAt: { $lt: new Date('2026-07-09T08:00:00.000Z') },
      'metadata.operation': { $exists: false }
    });
    expect(mocks.archiveSandboxResources).not.toHaveBeenCalled();
  });

  it('runs the existing archive state machine and keeps the sandboxArchive Track event', async () => {
    await expect(
      handler({ body: { runArchive: true, inactiveDays: 2 } } as any)
    ).resolves.toMatchObject({
      archiveTriggered: true,
      archiveResult: { successCount: 2, failCount: 1 }
    });

    expect(mocks.archiveSandboxResources).toHaveBeenCalledWith(
      expect.objectContaining({
        inactiveBefore: new Date('2026-07-14T08:00:00.000Z'),
        providers: ['opensandbox']
      })
    );
    expect(mocks.sandboxArchiveTrack).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: 'sandbox-3',
      reason: 'delete failed',
      source: 'initSandboxArchive'
    });
  });
});
