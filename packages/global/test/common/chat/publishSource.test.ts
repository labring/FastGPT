import { describe, expect, it } from 'vitest';
import {
  getChatPublishSourceName,
  getChatPublishSourceType
} from '@fastgpt/global/common/chat/publishSource';

describe('getChatPublishSourceType', () => {
  it.each([
    [{ publishSource: { type: 'api' }, source: 'share' }, 'api'],
    [{ publishSource: { type: null }, source: 'share' }, 'share'],
    [{ source: 'mcp' }, 'mcp'],
    [{ publishSource: { type: 'future' }, source: 'share' }, 'future'],
    [{}, undefined]
  ])('读取新分类并兼容缺失字段 %j', (input, expected) => {
    expect(getChatPublishSourceType(input)).toBe(expected);
  });
});

describe('getChatPublishSourceName', () => {
  it.each([
    [{ name: ' 当前渠道 ', sourceName: '旧名称' }, '当前渠道'],
    [{ name: '  ', sourceName: ' 旧名称 ' }, '旧名称'],
    [{ name: null, sourceName: '历史入口' }, '历史入口'],
    [{ sourceName: '\t ' }, undefined],
    [{ type: 'online', name: '应用名', sourceName: '旧应用名' }, undefined],
    [{ type: 'test', sourceName: '调试应用名' }, undefined],
    [{ type: 'cronJob', name: '定时任务应用名' }, undefined],
    [{}, undefined]
  ])('只使用有效名称 %j', (input, expected) => {
    expect(getChatPublishSourceName(input)).toBe(expected);
  });
});
