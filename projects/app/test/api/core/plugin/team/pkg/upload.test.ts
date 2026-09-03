import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { jsonRes } from '@fastgpt/service/common/response';

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn()
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

import handler from '@/pages/api/core/plugin/team/pkg/upload';

const mockJsonRes = vi.mocked(jsonRes);

describe('upload team plugin package handler', () => {
  const originalFeConfigs = global.feConfigs;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockReturnValue('zh');
    global.feConfigs = {
      ...global.feConfigs,
      enable_team_plugin_upload: false
    } as any;
    mockJsonRes.mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.feConfigs = originalFeConfigs;
  });

  it('returns forbidden before reading an uploaded package when installation is disabled', async () => {
    const req = { method: 'POST' } as any;
    const res = {} as any;

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        code: 500,
        error: TeamErrEnum.teamPluginInstallDisabled
      })
    );
  });
});
