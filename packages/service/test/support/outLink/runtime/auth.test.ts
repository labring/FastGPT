import { describe, expect, it, vi } from 'vitest';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

vi.mock('@fastgpt/service/common/rateLimit/interface/outLink', () => ({
  assertOutLinkRateLimit: vi.fn().mockResolvedValue(undefined)
}));

import { authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';

const createOutLink = (usagePoints: number, maxUsagePoints?: number): OutLinkSchemaType =>
  ({
    _id: '68ad85a7463006c963799a01',
    shareId: 'share-test-id',
    teamId: '68ad85a7463006c963799a02',
    tmbId: '68ad85a7463006c963799a03',
    appId: '68ad85a7463006c963799a04',
    type: PublishChannelEnum.share,
    name: 'share-limit-test',
    usagePoints,
    lastTime: new Date(),
    limit: maxUsagePoints === undefined ? { QPM: 0 } : { QPM: 0, maxUsagePoints }
  }) as OutLinkSchemaType;

describe('authOutLinkLimit', () => {
  it.each([
    { maxUsagePoints: undefined, usagePoints: 100, overLimit: false },
    { maxUsagePoints: -1, usagePoints: 100, overLimit: false },
    { maxUsagePoints: 0, usagePoints: 0, overLimit: true },
    { maxUsagePoints: 0, usagePoints: 0.001, overLimit: true },
    { maxUsagePoints: 1, usagePoints: 0.5, overLimit: false },
    { maxUsagePoints: 1, usagePoints: 1, overLimit: true },
    { maxUsagePoints: 1, usagePoints: 1.001, overLimit: true }
  ])('enforces quota boundaries: %j', async ({ maxUsagePoints, usagePoints, overLimit }) => {
    const outLink = createOutLink(usagePoints, maxUsagePoints);

    if (overLimit) {
      await expect(
        authOutLinkLimit({ outLink, outLinkUid: 'guest-1', question: 'hi' })
      ).rejects.toThrow('链接超出使用限制');
    } else {
      await expect(
        authOutLinkLimit({ outLink, outLinkUid: 'guest-1', question: 'hi' })
      ).resolves.toEqual({ uid: 'guest-1' });
    }
  });
});
