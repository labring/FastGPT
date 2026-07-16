import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  migrateLegacySandboxesToUserLevel: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/migration', () => ({
  migrateLegacySandboxesToUserLevel: mocks.migrateLegacySandboxesToUserLevel
}));

import handler from '@/pages/api/admin/4160/initUserSandbox';

describe('initUserSandbox API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue(undefined);
    mocks.migrateLegacySandboxesToUserLevel.mockResolvedValue({
      dryRun: true,
      legacySkillCount: 1,
      migratedSkillCount: 0,
      legacyAppCount: 2,
      migratedAppCount: 0,
      appGroupCount: 1,
      completedAppGroupCount: 0,
      failedCount: 0,
      failures: []
    });
  });

  it('authenticates root and defaults to dry-run', async () => {
    const req = { body: {} } as any;
    await expect(handler(req)).resolves.toMatchObject({ dryRun: true, legacyAppCount: 2 });

    expect(mocks.authCert).toHaveBeenCalledWith({ req, authRoot: true });
    expect(mocks.migrateLegacySandboxesToUserLevel).toHaveBeenCalledWith({
      dryRun: true
    });
  });
});
