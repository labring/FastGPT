import {
  createRedisLogicalKey,
  getRedisRuntime,
  toPhysicalRedisKey
} from '@fastgpt/dal/redis/runtime';
import { RATE_LIMIT_KEY_PREFIX } from '@fastgpt/service/common/rateLimit/core';
import {
  assertMemberRateLimit,
  MemberRateLimitPolicy
} from '@fastgpt/service/common/rateLimit/interface/member';
import { beforeEach, describe, expect, it } from 'vitest';

const getMemberRateLimitKey = (policy: string, memberId: string) =>
  toPhysicalRedisKey(
    createRedisLogicalKey({
      namespace: RATE_LIMIT_KEY_PREFIX,
      segments: ['member', policy, 'member', memberId]
    })
  );

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

describe('assertMemberRateLimit', () => {
  const memberId = 'member-rate-limit';

  beforeEach(async () => {
    await getRedisConnection().del(
      getMemberRateLimitKey(MemberRateLimitPolicy.Transcriptions, memberId),
      getMemberRateLimitKey(MemberRateLimitPolicy.Transcriptions, 'another-member'),
      getMemberRateLimitKey(MemberRateLimitPolicy.RedeemCoupon, memberId),
      getMemberRateLimitKey(MemberRateLimitPolicy.CheckPayResult, memberId),
      getMemberRateLimitKey(MemberRateLimitPolicy.ExportDataset, memberId)
    );
  });

  it('applies the configured one-request-per-second policy', async () => {
    const params = { policy: MemberRateLimitPolicy.Transcriptions, memberId } as const;

    await expect(assertMemberRateLimit(params)).resolves.toBeUndefined();
    await expect(assertMemberRateLimit(params)).rejects.toBeTruthy();

    const ttl = await getRedisConnection().ttl(
      getMemberRateLimitKey(MemberRateLimitPolicy.Transcriptions, memberId)
    );
    expect(ttl).toBeGreaterThanOrEqual(0);
    expect(ttl).toBeLessThanOrEqual(1);
  });

  it('keeps members and policies independent', async () => {
    await assertMemberRateLimit({ policy: MemberRateLimitPolicy.Transcriptions, memberId });

    await expect(
      assertMemberRateLimit({
        policy: MemberRateLimitPolicy.Transcriptions,
        memberId: 'another-member'
      })
    ).resolves.toBeUndefined();
    await expect(
      assertMemberRateLimit({ policy: MemberRateLimitPolicy.RedeemCoupon, memberId })
    ).resolves.toBeUndefined();
  });

  it('applies the configured 60-request-per-minute policy', async () => {
    const params = { policy: MemberRateLimitPolicy.CheckPayResult, memberId } as const;

    for (let index = 0; index < 60; index++) {
      await assertMemberRateLimit(params);
    }
    await expect(assertMemberRateLimit(params)).rejects.toBeTruthy();
  });

  it('applies a one-minute window to export policies', async () => {
    const params = { policy: MemberRateLimitPolicy.ExportDataset, memberId } as const;

    await expect(assertMemberRateLimit(params)).resolves.toBeUndefined();
    await expect(assertMemberRateLimit(params)).rejects.toBeTruthy();

    const ttl = await getRedisConnection().ttl(
      getMemberRateLimitKey(MemberRateLimitPolicy.ExportDataset, memberId)
    );
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});
