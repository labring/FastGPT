import { describe, expect, it } from 'vitest';
import {
  extractTextFromItem,
  groupMessagesByUser
} from '@fastgpt/service/support/outLink/wechat/messageParser';
import type { WeixinMessage } from '@fastgpt/service/support/outLink/wechat/ilinkClient';

/* ============ extractTextFromItem ============ */

describe('extractTextFromItem', () => {
  it('should extract plain text', () => {
    expect(extractTextFromItem({ type: 1, text_item: { text: 'hello' } })).toBe('hello');
  });

  it('should extract text with ref_msg', () => {
    expect(
      extractTextFromItem({
        type: 1,
        text_item: { text: 'reply' },
        ref_msg: { title: 'original' }
      })
    ).toBe('[引用: original]\nreply');
  });

  it('should extract voice text', () => {
    expect(extractTextFromItem({ type: 3, voice_item: { text: 'voice content' } })).toBe(
      'voice content'
    );
  });

  it('should return empty for unsupported type', () => {
    expect(extractTextFromItem({ type: 4 })).toBe('');
  });

  it('should return empty for text type without text_item', () => {
    expect(extractTextFromItem({ type: 1 })).toBe('');
  });

  it('should return empty for voice type without voice_item', () => {
    expect(extractTextFromItem({ type: 3 })).toBe('');
  });
});

/* ============ groupMessagesByUser ============ */

const makeMsg = (
  overrides: Partial<WeixinMessage> & { from_user_id: string; msgid: string }
): WeixinMessage => ({
  message_type: 1,
  item_list: [{ type: 1, text_item: { text: 'default text' } }],
  ...overrides
});

describe('groupMessagesByUser', () => {
  it('should group single message', () => {
    const msgs = [makeMsg({ from_user_id: 'u1', msgid: 'm1', context_token: 'ctx1' })];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: 'u1',
      text: 'default text',
      contextToken: 'ctx1',
      lastMsgId: 'm1'
    });
  });

  it('should merge multiple messages from the same user', () => {
    const msgs = [
      makeMsg({
        from_user_id: 'u1',
        msgid: 'm1',
        context_token: 'ctx1',
        item_list: [{ type: 1, text_item: { text: 'first' } }]
      }),
      makeMsg({
        from_user_id: 'u1',
        msgid: 'm2',
        context_token: 'ctx2',
        item_list: [{ type: 1, text_item: { text: 'second' } }]
      })
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('first\nsecond');
    expect(result[0].lastMsgId).toBe('m2');
    expect(result[0].contextToken).toBe('ctx2'); // 取最后一条的
  });

  it('should separate messages from different users', () => {
    const msgs = [
      makeMsg({ from_user_id: 'u1', msgid: 'm1' }),
      makeMsg({ from_user_id: 'u2', msgid: 'm2' })
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(2);
    expect(result.map((g) => g.userId)).toEqual(['u1', 'u2']);
  });

  it('should skip non-user messages (message_type !== 1)', () => {
    const msgs = [
      makeMsg({ from_user_id: 'u1', msgid: 'm1', message_type: 2 }), // bot message
      makeMsg({ from_user_id: 'u1', msgid: 'm2', message_type: 1 }) // user message
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].lastMsgId).toBe('m2');
  });

  it('should skip messages with no extractable text', () => {
    const msgs = [
      makeMsg({
        from_user_id: 'u1',
        msgid: 'm1',
        item_list: [{ type: 4 }] // unsupported type
      }),
      makeMsg({ from_user_id: 'u1', msgid: 'm2' }) // has text
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].lastMsgId).toBe('m2');
  });

  it('should handle empty message list', () => {
    expect(groupMessagesByUser([])).toEqual([]);
  });

  it('should handle messages with no item_list', () => {
    const msgs = [makeMsg({ from_user_id: 'u1', msgid: 'm1', item_list: undefined })];
    expect(groupMessagesByUser(msgs)).toEqual([]);
  });

  it('should use "unknown" for missing from_user_id', () => {
    const msgs: WeixinMessage[] = [
      {
        msgid: 'm1',
        from_user_id: undefined as any,
        message_type: 1,
        item_list: [{ type: 1, text_item: { text: 'hello' } }]
      }
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('unknown');
  });

  it('should default contextToken to empty when not provided', () => {
    const msgs = [makeMsg({ from_user_id: 'u1', msgid: 'm1', context_token: undefined })];
    const result = groupMessagesByUser(msgs);

    expect(result[0].contextToken).toBe('');
  });

  it('should handle voice messages in group', () => {
    const msgs = [
      makeMsg({
        from_user_id: 'u1',
        msgid: 'm1',
        item_list: [{ type: 3, voice_item: { text: 'voice msg' } }]
      })
    ];
    const result = groupMessagesByUser(msgs);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('voice msg');
  });
});
