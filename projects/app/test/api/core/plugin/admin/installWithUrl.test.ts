import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  install: vi.fn(),
  restore: vi.fn(),
  auditInstalled: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({ authSystemAdmin: mocks.auth }));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { installPlugins: mocks.install }
}));
vi.mock('@fastgpt/service/core/plugin/restoreLocalConfigs', () => ({
  restoreLocalPluginConfigs: mocks.restore
}));
vi.mock('@fastgpt/service/core/plugin/moderation/audit', () => ({
  recordInstalledModerationPluginsAudit: mocks.auditInstalled
}));
import handler from '@/pages/api/core/plugin/admin/installWithUrl';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import type { InstallPluginFromUrlBodyType } from '@fastgpt/global/openapi/core/plugin/admin/api';
const request = { body: { downloadUrls: ['https://example.test/a.pkg'] } } as ApiRequestProps<
  InstallPluginFromUrlBodyType,
  Record<string, never>
>;
const response = {} as ApiResponseType;

describe('URL installation local restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ teamId: 'team-1', tmbId: 'tmb-1' });
    mocks.restore.mockResolvedValue(undefined);
    mocks.auditInstalled.mockResolvedValue(undefined);
  });
  it('restores only successful identities on partial success and records moderation install audit', async () => {
    const result = {
      installed: [{ pluginId: 'keyword', version: '1', etag: 'abc' }],
      failed: [{ url: 'bad', reason: { en: 'failed' } }]
    };
    mocks.install.mockResolvedValueOnce(result);
    expect(await handler(request, response)).toEqual(result);
    expect(mocks.restore).toHaveBeenCalledWith({ pluginIds: ['keyword'] });
    expect(mocks.auditInstalled).toHaveBeenCalledWith({
      operator: { teamId: 'team-1', tmbId: 'tmb-1' },
      pluginIds: ['keyword'],
      lang: undefined
    });
  });
  it('does not restore anything after a remote failure', async () => {
    mocks.install.mockRejectedValueOnce(new Error('remote failed'));
    await expect(handler(request, response)).rejects.toThrow('remote failed');
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.auditInstalled).not.toHaveBeenCalled();
  });
});
