import { checkTeamFrequencyLimit, LimitTypeEnum } from '@fastgpt/service/common/api/frequencyLimit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTeamQPMLimit: vi.fn(),
  consumeTeamChatRateLimit: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  teamQPM: {
    getTeamQPMLimit: mocks.getTeamQPMLimit
  }
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/team', () => ({
  consumeTeamChatRateLimit: mocks.consumeTeamChatRateLimit
}));

describe('checkTeamFrequencyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips rate-limit consumption when the team has no QPM limit', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(undefined);

    await expect(
      checkTeamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat })
    ).resolves.toBeUndefined();
    expect(mocks.consumeTeamChatRateLimit).not.toHaveBeenCalled();
  });

  it('returns transport-neutral rate-limit metadata for an allowed request', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(20);
    mocks.consumeTeamChatRateLimit.mockResolvedValue({
      allowed: true,
      currentCount: 3,
      remaining: 17,
      ttlSeconds: 42,
      resetAt: 123456
    });

    await expect(
      checkTeamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat })
    ).resolves.toEqual({
      limit: 20,
      remaining: 17,
      resetAt: 123456
    });
    expect(mocks.consumeTeamChatRateLimit).toHaveBeenCalledWith({
      teamId: 'team-1',
      limit: 20,
      seconds: 60
    });
  });

  it('rejects a request after the configured QPM is exhausted', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(2);
    mocks.consumeTeamChatRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 3,
      remaining: 0,
      ttlSeconds: 12,
      resetAt: 123456
    });

    await expect(
      checkTeamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat })
    ).rejects.toThrow(
      'Rate limit exceeded. Maximum 2 requests per 60 seconds for this team. Please try again in 12 seconds.'
    );
  });

  it('fails closed when the team QPM configuration cannot be loaded', async () => {
    mocks.getTeamQPMLimit.mockRejectedValue(new Error('database unavailable'));

    await expect(
      checkTeamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat })
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Rate limit service unavailable. Please try again later.'
      })
    );
  });
});
