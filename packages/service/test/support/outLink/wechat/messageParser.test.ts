import { describe, expect, it } from 'vitest';
import {
  WechatMessageItemType,
  WechatMessageType
} from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { groupMessagesByUser } from '@fastgpt/service/support/outLink/wechat/messageParser';

describe('groupMessagesByUser', () => {
  it('keeps exact string message IDs for independent user groups', () => {
    expect(
      groupMessagesByUser([
        {
          message_id: '9007199254740992',
          message_type: WechatMessageType.USER,
          from_user_id: 'user-a',
          item_list: [{ type: WechatMessageItemType.TEXT, text_item: { text: 'A' } }]
        },
        {
          message_id: '9007199254740993',
          message_type: WechatMessageType.USER,
          from_user_id: 'user-b',
          item_list: [{ type: WechatMessageItemType.TEXT, text_item: { text: 'B' } }]
        }
      ])
    ).toEqual([
      expect.objectContaining({ userId: 'user-a', lastMsgId: '9007199254740992' }),
      expect.objectContaining({ userId: 'user-b', lastMsgId: '9007199254740993' })
    ]);
  });
});
