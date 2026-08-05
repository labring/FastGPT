import { describe, expect, it, vi } from 'vitest';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';

describe('ILinkClient', () => {
  it('preserves adjacent uint64 message IDs as exact strings', async () => {
    const client = new ILinkClient();
    vi.spyOn(client as any, 'post').mockResolvedValue(
      '{"msgs":[{"message_id":9007199254740992},{"message_id":9007199254740993}]}'
    );

    await expect(client.getUpdates('')).resolves.toMatchObject({
      msgs: [{ message_id: '9007199254740992' }, { message_id: '9007199254740993' }]
    });
  });
});
