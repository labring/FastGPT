import {
  assertTeamFrequencyLimit,
  createNodeApiLimitResponse,
  LimitTypeEnum,
  teamFrequencyLimit
} from '@fastgpt/service/common/api/frequencyLimit';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
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

describe('assertTeamFrequencyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('团队未配置 QPM 限制时直接返回空对象', async () => {
    mocks.getTeamQPMLimit.mockResolvedValueOnce(undefined);

    const result = await assertTeamFrequencyLimit({
      teamId: 'team-1',
      type: LimitTypeEnum.chat
    });

    expect(result).toEqual({});
    expect(mocks.consumeTeamChatRateLimit).not.toHaveBeenCalled();
  });

  it('团队配置 QPM 限制且未超限时返回限流状态', async () => {
    mocks.getTeamQPMLimit.mockResolvedValueOnce(60);
    mocks.consumeTeamChatRateLimit.mockResolvedValueOnce({
      allowed: true,
      currentCount: 1,
      remaining: 59,
      resetAt: 1700000060,
      ttlSeconds: 60
    });

    const result = await assertTeamFrequencyLimit({
      teamId: 'team-1',
      type: LimitTypeEnum.chat
    });

    expect(mocks.consumeTeamChatRateLimit).toHaveBeenCalledWith({
      teamId: 'team-1',
      limit: 60,
      seconds: 60
    });
    expect(result).toEqual({
      limit: 60,
      remaining: 59,
      resetAt: 1700000060
    });
  });

  it('团队 QPM 超限时抛出携带 tooManyRequest 和详细提示的 UserError', async () => {
    mocks.getTeamQPMLimit.mockResolvedValueOnce(60);
    mocks.consumeTeamChatRateLimit.mockResolvedValueOnce({
      allowed: false,
      currentCount: 61,
      remaining: 0,
      resetAt: 1700000060,
      ttlSeconds: 25
    });

    const errPromise = assertTeamFrequencyLimit({
      teamId: 'team-1',
      type: LimitTypeEnum.chat
    });

    await expect(errPromise).rejects.toBeInstanceOf(UserError);
    await expect(errPromise).rejects.toMatchObject({
      message: ERROR_ENUM.tooManyRequest,
      displayMessage:
        'Rate limit exceeded. Maximum 60 requests per 60 seconds for this team. Please try again in 25 seconds.'
    });
  });

  it('获取限流配置异常时跳过限流检查（fail open）', async () => {
    mocks.getTeamQPMLimit.mockRejectedValueOnce(new Error('redis connection failed'));

    const result = await assertTeamFrequencyLimit({
      teamId: 'team-1',
      type: LimitTypeEnum.chat
    });

    expect(result).toEqual({});
    expect(mocks.consumeTeamChatRateLimit).not.toHaveBeenCalled();
  });

  it('执行限流消耗异常时跳过限流检查（fail open）', async () => {
    mocks.getTeamQPMLimit.mockResolvedValueOnce(60);
    mocks.consumeTeamChatRateLimit.mockRejectedValueOnce(new Error('redis error'));

    const result = await assertTeamFrequencyLimit({
      teamId: 'team-1',
      type: LimitTypeEnum.chat
    });

    expect(result).toEqual({});
  });

  it('遇到 RedisInvalidArgumentError 时直接抛出原始错误', async () => {
    mocks.getTeamQPMLimit.mockResolvedValueOnce(60);
    const redisError = new RedisInvalidArgumentError({
      operation: 'rateLimit.consume',
      message: 'invalid key'
    });
    mocks.consumeTeamChatRateLimit.mockRejectedValueOnce(redisError);

    await expect(
      assertTeamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat
      })
    ).rejects.toThrow(redisError);
  });
});
