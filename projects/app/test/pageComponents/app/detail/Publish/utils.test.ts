import { describe, expect, it, vi } from 'vitest';
import { OutLinkEditSchema } from '@fastgpt/global/openapi/support/outLink/api';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { formatOutLinkUsagePoints } from '@/pageComponents/app/detail/Publish/utils';

vi.mock('@fastgpt/service/common/rateLimit/interface/outLink', () => ({
  assertOutLinkRateLimit: vi.fn().mockResolvedValue(undefined)
}));

import { authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';

describe('formatOutLinkUsagePoints', () => {
  it.each([
    { usagePoints: 0, maxUsagePoints: 0, isPlus: true, expected: '0 / 0' },
    { usagePoints: 0, maxUsagePoints: -1, isPlus: true, expected: '0 / 无限制' },
    { usagePoints: 3.6, maxUsagePoints: undefined, isPlus: true, expected: '4 / 无限制' },
    { usagePoints: 12.2, maxUsagePoints: 100, isPlus: true, expected: '12 / 100' },
    { usagePoints: 5.4, maxUsagePoints: 0, isPlus: false, expected: '5' }
  ])('formats channel quota display: %j', ({ usagePoints, maxUsagePoints, isPlus, expected }) => {
    expect(
      formatOutLinkUsagePoints({
        usagePoints,
        maxUsagePoints,
        isPlus,
        unlimitedLabel: '无限制'
      })
    ).toBe(expected);
  });

  it('保存 0 积分上限后列表显示 0 且首次请求即被拒绝', async () => {
    const saved = OutLinkEditSchema.parse({
      name: '零额度渠道',
      limit: { maxUsagePoints: 0 }
    });
    expect(saved.limit?.maxUsagePoints).toBe(0);

    expect(
      formatOutLinkUsagePoints({
        usagePoints: 0,
        maxUsagePoints: saved.limit?.maxUsagePoints,
        isPlus: true,
        unlimitedLabel: '无限制'
      })
    ).toBe('0 / 0');

    const outLink = {
      _id: '68ad85a7463006c963799a01',
      shareId: 'share-zero-quota',
      teamId: '68ad85a7463006c963799a02',
      tmbId: '68ad85a7463006c963799a03',
      appId: '68ad85a7463006c963799a04',
      type: PublishChannelEnum.share,
      name: saved.name,
      usagePoints: 0,
      lastTime: new Date(),
      limit: saved.limit
    } as OutLinkSchemaType;

    await expect(
      authOutLinkLimit({ outLink, outLinkUid: 'guest-1', question: 'hi' })
    ).rejects.toThrow('链接超出使用限制');
  });
});
