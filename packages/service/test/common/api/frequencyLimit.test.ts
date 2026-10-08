import {
  createNodeApiLimitResponse,
  LimitTypeEnum,
  teamFrequencyLimit
} from '@fastgpt/service/common/api/frequencyLimit';
import { UserError } from '@fastgpt/global/common/error/utils';
import { jsonRes } from '@fastgpt/service/common/response';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
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

describe('teamFrequencyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips rate-limit consumption when the team has no QPM limit', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(undefined);
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).resolves.toBe(true);
    expect(mocks.consumeTeamChatRateLimit).not.toHaveBeenCalled();
    expect(limitResponse).not.toHaveBeenCalled();
  });

  it('passes allowed rate-limit metadata to the response handler', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(20);
    mocks.consumeTeamChatRateLimit.mockResolvedValue({
      allowed: true,
      currentCount: 3,
      remaining: 17,
      ttlSeconds: 42,
      resetAt: 123456
    });
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).resolves.toBe(true);
    expect(limitResponse).toHaveBeenCalledWith({
      status: 'allowed',
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
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).resolves.toBe(false);
    expect(limitResponse).toHaveBeenCalledWith({
      status: 'rejected',
      code: 429,
      error: expect.objectContaining({
        message:
          'Rate limit exceeded. Maximum 2 requests per 60 seconds for this team. Please try again in 12 seconds.'
      })
    });
  });

  it('fails closed when the team QPM configuration cannot be loaded', async () => {
    mocks.getTeamQPMLimit.mockRejectedValue(new Error('database unavailable'));
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).resolves.toBe(false);
    expect(limitResponse).toHaveBeenCalledWith({
      status: 'rejected',
      code: 429,
      error: expect.objectContaining({
        message: 'Rate limit service unavailable. Please try again later.'
      })
    });
  });

  it('fails closed when Redis rate-limit consumption fails', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(20);
    mocks.consumeTeamChatRateLimit.mockRejectedValue(new Error('redis unavailable'));
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).resolves.toBe(false);
    expect(limitResponse).toHaveBeenCalledWith({
      status: 'rejected',
      code: 429,
      error: expect.objectContaining({
        message: 'Rate limit service unavailable. Please try again later.'
      })
    });
  });

  it('preserves Redis invalid-argument errors for the caller', async () => {
    mocks.getTeamQPMLimit.mockResolvedValue(20);
    const error = new RedisInvalidArgumentError({
      operation: 'consumeTeamChatRateLimit',
      message: 'invalid rate-limit input'
    });
    mocks.consumeTeamChatRateLimit.mockRejectedValue(error);
    const limitResponse = vi.fn();

    await expect(
      teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
    ).rejects.toBe(error);
    expect(limitResponse).not.toHaveBeenCalled();
  });
});

describe('createNodeApiLimitResponse', () => {
  it('writes rate-limit response headers for an allowed request', () => {
    const res = {
      setHeader: vi.fn()
    } as any;
    const limitResponse = createNodeApiLimitResponse(res);

    limitResponse({ status: 'allowed', limit: 20, remaining: 17, resetAt: 123456 });

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 20);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 17);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 123456);
  });

  it('writes a 429 JSON response for a rejected request', () => {
    const res = {} as any;
    const limitResponse = createNodeApiLimitResponse(res);
    const error = new UserError('Rate limit exceeded');

    limitResponse({ status: 'rejected', code: 429, error });

    expect(jsonRes).toHaveBeenCalledWith(res, { code: 429, error });
  });
});
