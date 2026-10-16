import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { UserError } from '@fastgpt/global/common/error/utils';

const { mockGetTeamQPMLimit, mockConsumeTeamChatRateLimit, mockJsonRes } = vi.hoisted(() => ({
  mockGetTeamQPMLimit: vi.fn(),
  mockConsumeTeamChatRateLimit: vi.fn(),
  mockJsonRes: vi.fn()
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  teamQPM: {
    getTeamQPMLimit: mockGetTeamQPMLimit
  }
}));

vi.mock('@fastgpt/service/common/rateLimit/interface/team', () => ({
  consumeTeamChatRateLimit: mockConsumeTeamChatRateLimit
}));

vi.mock('@fastgpt/service/common/response', () => ({
  jsonRes: mockJsonRes
}));

import {
  LimitTypeEnum,
  assertTeamFrequencyLimit,
  teamFrequencyLimit
} from '@fastgpt/service/common/api/frequencyLimit';

describe('frequencyLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertTeamFrequencyLimit', () => {
    it('团队未配置 QPM 限制时直接返回空对象', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(undefined);

      const result = await assertTeamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat
      });

      expect(result).toEqual({});
      expect(mockConsumeTeamChatRateLimit).not.toHaveBeenCalled();
    });

    it('团队配置 QPM 限制且未超限时返回限流状态', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
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

      expect(mockConsumeTeamChatRateLimit).toHaveBeenCalledWith({
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

    it('团队 QPM 超限时抛出 UserError', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
        allowed: false,
        currentCount: 61,
        remaining: 0,
        resetAt: 1700000060,
        ttlSeconds: 25
      });

      await expect(
        assertTeamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat
        })
      ).rejects.toThrowError(
        new UserError(
          'Rate limit exceeded. Maximum 60 requests per 60 seconds for this team. Please try again in 25 seconds.'
        )
      );
    });

    it('获取限流配置异常时抛出限流服务不可用错误', async () => {
      mockGetTeamQPMLimit.mockRejectedValueOnce(new Error('redis connection failed'));

      await expect(
        assertTeamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat
        })
      ).rejects.toThrowError(
        new UserError('Rate limit service unavailable. Please try again later.')
      );
    });

    it('执行限流消耗异常时抛出限流服务不可用错误', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockRejectedValueOnce(new Error('redis error'));

      await expect(
        assertTeamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat
        })
      ).rejects.toThrowError(
        new UserError('Rate limit service unavailable. Please try again later.')
      );
    });

    it('遇到 RedisInvalidArgumentError 时直接抛出原始错误', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      const redisError = new RedisInvalidArgumentError('invalid key', {
        operation: 'rateLimit.consume'
      });
      mockConsumeTeamChatRateLimit.mockRejectedValueOnce(redisError);

      await expect(
        assertTeamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat
        })
      ).rejects.toThrow(redisError);
    });
  });

  describe('teamFrequencyLimit', () => {
    const createRes = () => {
      const headers: Record<string, any> = {};
      return {
        setHeader: vi.fn((key: string, val: any) => {
          headers[key] = val;
        }),
        getHeader: (key: string) => headers[key],
        headers
      } as any;
    };

    it('未达到限制且有限流值时写入响应头并返回 true', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(100);
      mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
        allowed: true,
        currentCount: 1,
        remaining: 99,
        resetAt: 1700000060,
        ttlSeconds: 60
      });

      const res = createRes();
      const allowed = await teamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat,
        res
      });

      expect(allowed).toBe(true);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 1700000060);
      expect(mockJsonRes).not.toHaveBeenCalled();
    });

    it('未配置限制时不写响应头并返回 true', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(undefined);

      const res = createRes();
      const allowed = await teamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat,
        res
      });

      expect(allowed).toBe(true);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(mockJsonRes).not.toHaveBeenCalled();
    });

    it('超限时通过 jsonRes 返回 429 并返回 false', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
        allowed: false,
        currentCount: 61,
        remaining: 0,
        resetAt: 1700000060,
        ttlSeconds: 20
      });

      const res = createRes();
      const allowed = await teamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat,
        res
      });

      expect(allowed).toBe(false);
      expect(mockJsonRes).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          code: 429,
          error: expect.any(UserError)
        })
      );
    });
  });
});
