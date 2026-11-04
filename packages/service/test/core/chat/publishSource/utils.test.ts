import { describe, expect, it } from 'vitest';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  assertChatPublishSource,
  buildChatPublishSourceFilter,
  buildSharePublishSourceFilter,
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
  it('拒绝无效类型和 ID', () => {
    expect(() => resolveCurrentChatPublishSource({ source: 'future' })).toThrow();
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

describe('buildChatPublishSourceFilter', () => {
  it('省略为不过滤，空数组保留未选择条件', () => {
    expect(buildChatPublishSourceFilter()).toEqual({});
    expect(buildChatPublishSourceFilter([])).toEqual({
      $or: [
        { 'publishSource.type': { $in: [] } },
        { 'publishSource.type': null, source: { $in: [] } }
      ]
    });
  });
});

describe('buildSharePublishSourceFilter', () => {
  it('完整新来源优先，只有缺新字段时才使用外部 shareId', () => {
    expect(buildSharePublishSourceFilter({ id: a, shareId: 'public-share' })).toEqual({
      $or: [
        { 'publishSource.type': ChatSourceEnum.share, 'publishSource.id': a },
        {
          $and: [
            { $or: [{ 'publishSource.type': null }, { 'publishSource.id': null }] },
            { shareId: 'public-share' }
          ]
        }
      ]
    });
  });
});
