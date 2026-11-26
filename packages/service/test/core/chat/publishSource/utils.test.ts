import { describe, expect, it } from 'vitest';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatPublishSourceSchema } from '@fastgpt/global/core/chat/publishSource/type';
import {
  assertChatPublishSource,
  resolveCurrentChatPublishSource
} from '@fastgpt/service/core/chat/publishSource/utils';

const a = '6909d3c4b6a72185d0f08101';
const b = '6909d3c4b6a72185d0f08102';

describe('resolveCurrentChatPublishSource', () => {
  it.each([ChatSourceEnum.online, ChatSourceEnum.test, ChatSourceEnum.cronJob])(
    '内部入口 %s 不遗留旧渠道 ID',
    (type) => {
      expect(
        resolveCurrentChatPublishSource({ source: type, publishSource: { type, id: a } })
      ).toEqual({ type });
      expect(resolveCurrentChatPublishSource({ source: type })).toEqual({ type });
    }
  );

  it.each([ChatSourceEnum.api, ChatSourceEnum.mcp, ChatSourceEnum.share, ChatSourceEnum.dingtalk])(
    '外部入口 %s 要求可信 ID',
    (type) => {
      expect(
        resolveCurrentChatPublishSource({ source: type, publishSource: { type, id: a } })
      ).toEqual({ type, id: a });
      expect(() => resolveCurrentChatPublishSource({ source: type })).toThrow('ID is missing');
    }
  );
  it('无法识别的来源归为 unknown，不保留无法确认归属的渠道 ID', () => {
    expect(resolveCurrentChatPublishSource({ source: 'future' })).toEqual({ type: 'unknown' });
    expect(
      resolveCurrentChatPublishSource({
        source: 'future',
        publishSource: ChatPublishSourceSchema.parse({ type: 'future', id: a })
      })
    ).toEqual({ type: 'unknown' });
  });

  it('来源兜底不吞掉无效 ID 的校验错误', () => {
    expect(() =>
      resolveCurrentChatPublishSource({
        source: 'api',
        publishSource: { type: ChatSourceEnum.api, id: 'secret-key' }
      })
    ).toThrow();
  });
});

describe('assertChatPublishSource', () => {
  it.each([ChatSourceEnum.share, ChatSourceEnum.mcp])('仅 %s 比较完整旧来源', (type) => {
    const current = { type, id: a };
    for (const previous of [undefined, null, {}, { type }, { id: b }, { type, id: a }]) {
      expect(() => assertChatPublishSource({ previous, current })).not.toThrow();
    }
    expect(() => assertChatPublishSource({ previous: { type, id: b }, current })).toThrow(
      ChatErrEnum.unAuthChat
    );
    expect(() =>
      assertChatPublishSource({ previous: { type: ChatSourceEnum.api, id: a }, current })
    ).toThrow(ChatErrEnum.unAuthChat);
    expect(() => assertChatPublishSource({ previous: undefined, current: { type } })).toThrow(
      ChatErrEnum.unAuthChat
    );
  });

  it('API 与网页登录允许在原权限范围内改变来源', () => {
    for (const type of [ChatSourceEnum.api, ChatSourceEnum.online, ChatSourceEnum.feishu]) {
      expect(() =>
        assertChatPublishSource({
          previous: { type: ChatSourceEnum.share, id: b },
          current: { type, id: a }
        })
      ).not.toThrow();
    }
  });
});
