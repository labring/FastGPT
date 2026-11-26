import { getRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  assertOutLinkBrandRequestRateLimit,
  assertOutLinkBrandWriteRateLimit
} from '@fastgpt/service/common/rateLimit/interface/outLinkBrand';
import { assertOutLinkRateLimit } from '@fastgpt/service/common/rateLimit/interface/outLink';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRedisConnection = () => getRedisRuntime().getCommandConnection();
const ip = '192.0.2.1';
const outLinkId = 'brand-link';

beforeEach(async () => {
  await getRedisConnection().flushdb();
});
afterEach(() => vi.restoreAllMocks());

describe('assertOutLinkBrandRequestRateLimit', () => {
  it('admits at most 300 concurrent requests for one IP across all links', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 301 }, () => assertOutLinkBrandRequestRateLimit({ ip }))
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(300);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      { status: 'rejected', reason: ERROR_ENUM.tooManyRequest }
    ]);
    await expect(assertOutLinkBrandRequestRateLimit({ ip: '192.0.2.2' })).resolves.toBeUndefined();
  });

  it('stops requests when Redis is unavailable', async () => {
    vi.mocked(getRedisConnection().multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });
    await expect(assertOutLinkBrandRequestRateLimit({ ip })).rejects.toBe(
      ERROR_ENUM.tooManyRequest
    );
  });
});

describe('assertOutLinkBrandWriteRateLimit', () => {
  it('caps concurrent writes and isolates other links, IPs and chat QPM', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 61 }, () => assertOutLinkBrandWriteRateLimit({ outLinkId, ip }))
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(60);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      { status: 'rejected', reason: ERROR_ENUM.tooManyRequest }
    ]);

    await expect(
      assertOutLinkBrandWriteRateLimit({ outLinkId: 'another-link', ip })
    ).resolves.toBeUndefined();
    await expect(
      assertOutLinkBrandWriteRateLimit({ outLinkId, ip: '192.0.2.2' })
    ).resolves.toBeUndefined();
    await expect(assertOutLinkRateLimit({ outLinkId, uid: ip, limit: 1 })).resolves.toBeUndefined();
  });

  it('starts a new quota after the fixed window expires', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await Promise.all(
      Array.from({ length: 60 }, () => assertOutLinkBrandWriteRateLimit({ outLinkId, ip }))
    );
    await expect(assertOutLinkBrandWriteRateLimit({ outLinkId, ip })).rejects.toBe(
      ERROR_ENUM.tooManyRequest
    );
    now += 60_001;
    await expect(assertOutLinkBrandWriteRateLimit({ outLinkId, ip })).resolves.toBeUndefined();
  });

  it('stops writes when Redis is unavailable', async () => {
    vi.mocked(getRedisConnection().multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });
    await expect(assertOutLinkBrandWriteRateLimit({ outLinkId, ip })).rejects.toBe(
      ERROR_ENUM.tooManyRequest
    );
  });
});
