import {
  createRedisLogicalKey,
  getRedisRuntime,
  toPhysicalRedisKey
} from '@fastgpt/dal/redis/runtime';
import { RATE_LIMIT_KEY_PREFIX } from '@fastgpt/service/common/rateLimit/core';
import { assertOutLinkRateLimit } from '@fastgpt/service/common/rateLimit/interface/outLink';
import { beforeEach, describe, expect, it } from 'vitest';

const getOutLinkRateLimitKey = (outLinkId: string, uid: string) =>
  toPhysicalRedisKey(
    createRedisLogicalKey({
      namespace: RATE_LIMIT_KEY_PREFIX,
      segments: ['out-link', 'request', 'out-link', outLinkId, 'uid', uid]
    })
  );

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

describe('assertOutLinkRateLimit', () => {
  const outLinkId = 'out-link-rate-limit';
  const uid = 'visitor-rate-limit';

  beforeEach(async () => {
    await getRedisConnection().del(
      getOutLinkRateLimitKey(outLinkId, uid),
      getOutLinkRateLimitKey(outLinkId, 'another-visitor'),
      getOutLinkRateLimitKey('another-out-link', uid)
    );
  });

  it('limits requests by the outLinkId and uid combination', async () => {
    const params = { outLinkId, uid, limit: 1 };

    await expect(assertOutLinkRateLimit(params)).resolves.toBeUndefined();
    await expect(assertOutLinkRateLimit(params)).rejects.toThrow('每分钟仅能请求 1 次~');
  });

  it('keeps different visitors and out links independent', async () => {
    await assertOutLinkRateLimit({ outLinkId, uid, limit: 1 });

    await expect(
      assertOutLinkRateLimit({ outLinkId, uid: 'another-visitor', limit: 1 })
    ).resolves.toBeUndefined();
    await expect(
      assertOutLinkRateLimit({ outLinkId: 'another-out-link', uid, limit: 1 })
    ).resolves.toBeUndefined();
  });
});
