import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetTeamPlanStatus } = vi.hoisted(() => ({
  mockGetTeamPlanStatus: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: mockGetTeamPlanStatus
}));

const { getTeamFileSizeLimitBytes } = await import('@fastgpt/service/support/permission/fileLimit');

describe('support/permission/fileLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    getTestInstanceConfig().resource.uploadFileMaxSize = 500;
  });

  it('团队套餐配置覆盖系统上限，并只在边界转换一次 MB 到字节', async () => {
    mockGetTeamPlanStatus.mockResolvedValue({ standard: { maxUploadFileSize: 2048 } });

    await expect(getTeamFileSizeLimitBytes({ teamId: 'team-1' })).resolves.toBe(2048 * 1024 * 1024);
    expect(mockGetTeamPlanStatus).toHaveBeenCalledWith({ teamId: 'team-1' });
  });

  it('套餐没有配置时回退系统上传上限', async () => {
    mockGetTeamPlanStatus.mockResolvedValue({ standard: undefined });

    await expect(getTeamFileSizeLimitBytes({ teamId: 'team-1' })).resolves.toBe(500 * 1024 * 1024);
  });
});
