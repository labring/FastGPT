import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  confirmPlugin: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    confirmPlugin: mocks.confirmPlugin
  }
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
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.confirmPlugin.mockResolvedValue({
      confirmed: [{ ...tool, pluginId: 'weather' }],
      failed: []
    });
  });

  it('returns success when all plugins are confirmed', async () => {
    const res = await Call(handler, { body: { toolIds: [tool] } });

    expect(res.code).toBe(200);
    expect(mocks.confirmPlugin).toHaveBeenCalledWith([{ ...tool, pluginId: 'weather' }]);
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
  });
});
