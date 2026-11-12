import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  confirmPlugin: vi.fn(),
  restoreModerationConfigs: vi.fn(),
  recordInstalledModerationPluginsAudit: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    confirmPlugin: mocks.confirmPlugin
  }
}));

vi.mock('@fastgpt/service/core/plugin/restoreLocalConfigs', () => ({
  restoreLocalPluginConfigs: mocks.restoreModerationConfigs
}));

vi.mock('@fastgpt/service/core/plugin/moderation/audit', () => ({
  recordInstalledModerationPluginsAudit: mocks.recordInstalledModerationPluginsAudit
}));

import handler from '@/pages/api/core/plugin/admin/pkg/confirm';

const tool = {
  pluginId: 'systemTool-weather',
  version: '1.0.0',
  etag: 'etag-weather'
};

describe('confirm system plugin package handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue({ teamId: 'team-1', tmbId: 'tmb-1' });
    mocks.recordInstalledModerationPluginsAudit.mockResolvedValue(undefined);
    mocks.confirmPlugin.mockResolvedValue({
      confirmed: [{ ...tool, pluginId: 'weather' }],
      failed: []
    });
  });

  it('returns success when all plugins are confirmed', async () => {
    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).toBe(200);
    expect(mocks.restoreModerationConfigs).toHaveBeenCalledWith({ pluginIds: ['weather'] });
    expect(mocks.recordInstalledModerationPluginsAudit).toHaveBeenCalledWith({
      operator: { teamId: 'team-1', tmbId: 'tmb-1' },
      pluginIds: ['weather'],
      lang: undefined
    });
    expect(mocks.confirmPlugin).toHaveBeenCalledWith([{ ...tool, pluginId: 'weather' }]);
  });

  it('restores only successfully confirmed packages on partial failure', async () => {
    mocks.confirmPlugin.mockResolvedValueOnce({
      confirmed: [{ pluginId: 'keyword', version: '1.0.0', etag: 'keyword-etag' }],
      failed: [{ uniqueId: tool, reason: { en: 'Confirm failed' } }]
    });
    const res = await Call(handler, { body: { toolIds: [tool] } });
    expect(res.code).not.toBe(200);
    expect(mocks.restoreModerationConfigs).toHaveBeenCalledWith({ pluginIds: ['keyword'] });
  });

  it('returns failure when any plugin confirmation fails', async () => {
    mocks.confirmPlugin.mockResolvedValueOnce({
      confirmed: [],
      failed: [
        {
          uniqueId: { pluginId: 'weather', version: '1.0.0', etag: 'etag-weather' },
          reason: { en: 'Confirm failed' }
        }
      ]
    });

    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).not.toBe(200);
    expect(mocks.restoreModerationConfigs).not.toHaveBeenCalled();
    expect(mocks.recordInstalledModerationPluginsAudit).not.toHaveBeenCalled();
  });
});
