import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig,
  setTestLicenseActive
} from '@test/utils/instanceConfigSnapshot';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  teamConfig: vi.fn(),
  systemConfig: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/publish/authChat', () => ({ authOutLink: vi.fn() }));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({ assertAuthModels: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/model/config', () => ({
  getTeamModelListService: mocks.teamConfig,
  getSystemModelConfigService: mocks.systemConfig
}));
import handler from '@/pages/api/core/ai/model/config';

/** handler → authModelScope → 真实 feature/License gate；数据库/目录留在边界外。 */
describe('team model configuration feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    setTestLicenseActive(true);
    mocks.authUserPer.mockResolvedValue({
      teamId: 'owned-team',
      tmbId: 'owned-member',
      isRoot: true
    });
    mocks.teamConfig.mockResolvedValue({ models: [], channels: [], providers: [] });
  });
  it('rejects the next team management request after disabling the live feature', async () => {
    const req = { query: { channelType: 'team' } } as any;
    getTestInstanceConfig().feature.enableTeamModel = true;
    await expect(handler(req, {} as any)).resolves.toMatchObject({ models: [] });
    expect(mocks.teamConfig).toHaveBeenCalledOnce();
    getTestInstanceConfig().feature.enableTeamModel = false;
    await expect(handler(req, {} as any)).rejects.toBe(ModelErrEnum.teamModelDisabled);
    expect(mocks.teamConfig).toHaveBeenCalledOnce();
  });
});
