import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisInvalidArgumentError } from '@fastgpt/dal/redis';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

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
  createNodeApiLimitResponse,
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

    it('团队 QPM 超限时抛出携带 tooManyRequest 和详细提示的 UserError', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
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
      mockGetTeamQPMLimit.mockRejectedValueOnce(new Error('redis connection failed'));

      const result = await assertTeamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat
      });

      expect(result).toEqual({});
      expect(mockConsumeTeamChatRateLimit).not.toHaveBeenCalled();
    });

    it('执行限流消耗异常时跳过限流检查（fail open）', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockRejectedValueOnce(new Error('redis error'));

      const result = await assertTeamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat
      });

      expect(result).toEqual({});
    });

    it('遇到 RedisInvalidArgumentError 时直接抛出原始错误', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      const redisError = new RedisInvalidArgumentError({
        operation: 'rateLimit.consume',
        message: 'invalid key'
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

    it('遇到 RedisInvalidArgumentError 时直接抛出原始错误而不吞为 429', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      const redisError = new RedisInvalidArgumentError({
        operation: 'rateLimit.consume',
        message: 'invalid key'
      });
      mockConsumeTeamChatRateLimit.mockRejectedValueOnce(redisError);

      const res = createRes();
      await expect(
        teamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat,
          res
        })
      ).rejects.toThrow(redisError);
      expect(mockJsonRes).not.toHaveBeenCalled();
    });

    it('Redis 异常时安全放行（fail open）返回 true', async () => {
      mockGetTeamQPMLimit.mockResolvedValueOnce(60);
      mockConsumeTeamChatRateLimit.mockRejectedValueOnce(new Error('redis connection timeout'));

      const res = createRes();
      const allowed = await teamFrequencyLimit({
        teamId: 'team-1',
        type: LimitTypeEnum.chat,
        res
      });

      expect(allowed).toBe(true);
      expect(mockJsonRes).not.toHaveBeenCalled();
    });

    describe('limitResponse 回调', () => {
      it('向响应适配器传递限流元数据，并保留 Next 响应头', async () => {
        mockGetTeamQPMLimit.mockResolvedValueOnce(60);
        mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
          allowed: true,
          remaining: 59,
          resetAt: 1700000060
        });
        const res = createRes();
        const limitResponse = vi.fn(createNodeApiLimitResponse(res));

        await expect(
          teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
        ).resolves.toBe(true);

        expect(limitResponse).toHaveBeenCalledExactlyOnceWith({
          status: 'allowed',
          limit: 60,
          remaining: 59,
          resetAt: 1700000060
        });
        expect(res.headers).toEqual({
          'X-RateLimit-Limit': 60,
          'X-RateLimit-Remaining': 59,
          'X-RateLimit-Reset': 1700000060
        });
        expect(mockJsonRes).not.toHaveBeenCalled();
      });

      it('未配置限流时直接放行，不调用响应适配器', async () => {
        mockGetTeamQPMLimit.mockResolvedValueOnce(undefined);
        const limitResponse = vi.fn();

        await expect(
          teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
        ).resolves.toBe(true);

        expect(limitResponse).not.toHaveBeenCalled();
        expect(mockConsumeTeamChatRateLimit).not.toHaveBeenCalled();
      });

      it('超限时将原始错误交给响应适配器，保留 429 响应', async () => {
        mockGetTeamQPMLimit.mockResolvedValueOnce(60);
        mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
          allowed: false,
          currentCount: 61,
          ttlSeconds: 20
        });
        const res = createRes();
        const limitResponse = vi.fn(createNodeApiLimitResponse(res));

        await expect(
          teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
        ).resolves.toBe(false);

        expect(limitResponse).toHaveBeenCalledExactlyOnceWith({
          status: 'rejected',
          code: 429,
          error: expect.objectContaining({
            message: ERROR_ENUM.tooManyRequest,
            displayMessage:
              'Rate limit exceeded. Maximum 60 requests per 60 seconds for this team. Please try again in 20 seconds.'
          })
        });
        expect(mockJsonRes).toHaveBeenCalledWith(res, {
          code: 429,
          error: expect.any(UserError)
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it.each(['configuration', 'redis'] as const)('%s 异常时放行，不发送 429', async (stage) => {
        if (stage === 'configuration') {
          mockGetTeamQPMLimit.mockRejectedValueOnce(new Error('configuration unavailable'));
        } else {
          mockGetTeamQPMLimit.mockResolvedValueOnce(60);
          mockConsumeTeamChatRateLimit.mockRejectedValueOnce(new Error('redis unavailable'));
        }
        const limitResponse = vi.fn();

        await expect(
          teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
        ).resolves.toBe(true);

        expect(limitResponse).not.toHaveBeenCalled();
        expect(mockJsonRes).not.toHaveBeenCalled();
      });

      it('Redis 参数错误继续抛出，不转换成限流响应', async () => {
        mockGetTeamQPMLimit.mockResolvedValueOnce(60);
        const error = new RedisInvalidArgumentError({
          operation: 'rateLimit.consume',
          message: 'invalid key'
        });
        mockConsumeTeamChatRateLimit.mockRejectedValueOnce(error);
        const limitResponse = vi.fn();

        await expect(
          teamFrequencyLimit({ teamId: 'team-1', type: LimitTypeEnum.chat, limitResponse })
        ).rejects.toBe(error);

        expect(limitResponse).not.toHaveBeenCalled();
      });

      it.each([true, false])('等待异步响应适配器结束后返回 allowed=%s', async (allowed) => {
        mockGetTeamQPMLimit.mockResolvedValueOnce(60);
        mockConsumeTeamChatRateLimit.mockResolvedValueOnce({
          allowed,
          remaining: 59,
          resetAt: 1700000060,
          currentCount: allowed ? 1 : 61,
          ttlSeconds: 20
        });
        let finishResponse!: () => void;
        const response = new Promise<void>((resolve) => {
          finishResponse = resolve;
        });
        const limitResponse = vi.fn(() => response);
        let settled = false;
        const result = teamFrequencyLimit({
          teamId: 'team-1',
          type: LimitTypeEnum.chat,
          limitResponse
        }).then((value) => {
          settled = true;
          return value;
        });

        await vi.waitFor(() => expect(limitResponse).toHaveBeenCalledOnce());
        expect(settled).toBe(false);
        finishResponse();
        await expect(result).resolves.toBe(allowed);
      });
    });
  });
});
