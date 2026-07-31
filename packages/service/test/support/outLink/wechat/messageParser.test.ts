import { describe, expect, it } from 'vitest';
import { groupMessagesByUser } from '@fastgpt/service/support/outLink/wechat/messageParser';
import {
  WechatMessageItemType,
  WechatMessageType,
  type WeixinMessage
} from '@fastgpt/service/support/outLink/wechat/ilinkClient';

describe('groupMessagesByUser', () => {
  it('merges supported text, transcript and media items for one user', () => {
    const msgs: WeixinMessage[] = [
      {
        message_id: 7488873808005851000,
        from_user_id: 'u1',
        message_type: WechatMessageType.USER,
        context_token: 'ctx1',
        item_list: [
          { type: WechatMessageItemType.TEXT, text_item: { text: 'first' } },
          {
            type: WechatMessageItemType.IMAGE,
            image_item: { media: { full_url: 'https://cdn/image' } }
          }
        ]
      },
      {
        message_id: 7488876884506889000,
        from_user_id: 'u1',
        message_type: WechatMessageType.USER,
        context_token: 'ctx2',
        item_list: [
          { type: WechatMessageItemType.VOICE, voice_item: { text: 'voice transcript' } },
          {
            type: WechatMessageItemType.FILE,
            file_item: { media: { full_url: 'https://cdn/file', aes_key: 'key' } }
          },
          { type: WechatMessageItemType.VIDEO }
        ]
      }
    ];

    expect(groupMessagesByUser(msgs)).toEqual([
      {
        userId: 'u1',
        contextToken: 'ctx2',
        lastMsgId: '7488876884506889000',
        items: [
          { type: WechatMessageItemType.TEXT, text_item: { text: 'first' } },
          {
            type: WechatMessageItemType.IMAGE,
            image_item: { media: { full_url: 'https://cdn/image' } }
          },
          { type: WechatMessageItemType.VOICE, voice_item: { text: 'voice transcript' } },
          {
            type: WechatMessageItemType.FILE,
            file_item: { media: { full_url: 'https://cdn/file', aes_key: 'key' } }
          }
        ]
      }
    ]);
  });
});
