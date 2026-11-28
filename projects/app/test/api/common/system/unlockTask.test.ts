import handler from '@/pages/api/common/system/unlockTask';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { resumeUnpaidDatasetTraining } from '@fastgpt/service/core/dataset/training/runtime';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/dataset/training/runtime', () => ({
  resumeUnpaidDatasetTraining: vi.fn()
}));

describe('unlockTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resumes training only for the authenticated team', async () => {
    const teamId = '507f1f77bcf86cd799439011';
    vi.mocked(resumeUnpaidDatasetTraining).mockRejectedValueOnce(new Error('training unavailable'));

    const result = await Call(handler, {
      headers: {},
      auth: {
        userId: 'user-1',
        teamId,
        tmbId: 'member-1',
        appId: '',
        authType: AuthUserTypeEnum.token,
        sourceName: undefined,
        apikey: '',
        isRoot: false,
        sessionId: 'session-1'
      }
    });

    expect(result).toMatchObject({ code: 200, data: undefined });
    expect(resumeUnpaidDatasetTraining).toHaveBeenCalledExactlyOnceWith({
      teamId,
      refreshBalance: true
    });
  });

  it('does not resume training if authentication fails', async () => {
    const result = await Call(handler, { headers: {} });

    expect(result).toMatchObject({ code: 200, data: undefined });
    expect(resumeUnpaidDatasetTraining).not.toHaveBeenCalled();
  });
});
