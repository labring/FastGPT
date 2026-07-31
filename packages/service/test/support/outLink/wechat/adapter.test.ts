import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { OutlinkResponseEvent } from '@fastgpt/service/support/outLink/runtime/type';
import { createWechatOutlinkAdapter } from '@fastgpt/service/support/outLink/wechat/adapter';

const jobData = {
  shareId: 'share-id',
  userId: 'user-id',
  text: 'voice transcript',
  contextToken: 'context-token',
  lastMsgId: 'message-id'
};

const createAdapter = () => {
  const client = { sendMessage: vi.fn().mockResolvedValue(undefined) };
  return {
    client,
    adapter: createWechatOutlinkAdapter({ client: client as any, jobData })
  };
};

describe('createWechatOutlinkAdapter', () => {
  it('normalizes a reply job with the existing chat identity', async () => {
    const { adapter } = createAdapter();

    await expect(adapter.normalizeMessage()).resolves.toEqual({
      chatId: 'wechat_share-id_user-id',
      messageId: 'message-id',
      chatUserId: 'user-id',
      query: [{ text: { content: 'voice transcript' } }]
    });
  });

  it('sends only terminal runtime events to iLink', async () => {
    const { adapter, client } = createAdapter();
    const events: OutlinkResponseEvent[] = [
      { type: 'start' },
      { type: 'chunk', content: 'partial' },
      { type: 'done', content: 'complete answer' }
    ];

    await adapter.respond(Readable.from(events));

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith({
      to_user_id: 'user-id',
      text: 'complete answer',
      context_token: 'context-token'
    });
  });
});
