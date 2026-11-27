import { describe, expect, it } from 'vitest';
import {
  buildTeamMemberNameSortKey,
  isValidTeamMemberNameSortKey
} from '@fastgpt/service/support/user/team/sortKey';

const sortByKey = (names: string[]) =>
  [...names].sort((a, b) => {
    const ka = buildTeamMemberNameSortKey(a);
    const kb = buildTeamMemberNameSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

describe('buildTeamMemberNameSortKey', () => {
  it('groups by A-Z initial with Chinese before English in the same letter, followed by digits then special characters', () => {
    const input = [
      '😊小助手',
      '_bot',
      '#测试',
      '@admin',
      '9号',
      '123',
      '007',
      'Zoe',
      '张三',
      '张安',
      '张伟',
      '刘安',
      '林安',
      '李伟',
      'Bob',
      '白雪',
      'apple',
      '安娜',
      'Alice',
      '艾米',
      '阿明'
    ];

    expect(sortByKey(input)).toEqual([
      '阿明',
      '艾米',
      '安娜',
      'Alice',
      'apple',
      '白雪',
      'Bob',
      '李伟',
      '林安',
      '刘安',
      '张安',
      '张三',
      '张伟',
      'Zoe',
      '007',
      '123',
      '9号',
      '#测试',
      '@admin',
      '_bot',
      '😊小助手'
    ]);
  });

  it('handles surname polyphones and pure-ASCII v conversion for ü syllables', () => {
    expect(buildTeamMemberNameSortKey('曾国藩').startsWith('0:z:0:zeng guo fan\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('单田芳').startsWith('0:s:0:shan tian fang\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('仇英').startsWith('0:q:0:qiu ying\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('解缙').startsWith('0:x:0:xie jin\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('重庆').startsWith('0:c:0:chong qing\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('吕布').startsWith('0:l:0:lv bu\x1f')).toBe(true);
    expect(buildTeamMemberNameSortKey('女娲').startsWith('0:n:0:nv wa\x1f')).toBe(true);
  });

  it('keeps syllable boundaries ordered within Chinese and puts Chinese ahead of English for the same initial', () => {
    expect(sortByKey(['lily', '刘安', '林安', '李伟', '李', 'li'])).toEqual([
      '李',
      '李伟',
      '林安',
      '刘安',
      'li',
      'lily'
    ]);
  });

  it('normalizes whitespace, control characters, empty/non-string values, and caps index key size', () => {
    expect(buildTeamMemberNameSortKey('  Alice  ')).toBe(buildTeamMemberNameSortKey('alice'));
    expect(buildTeamMemberNameSortKey('a\x1fb')).toBe(buildTeamMemberNameSortKey('a b'));
    expect(buildTeamMemberNameSortKey('')).toBe('2:');
    expect(buildTeamMemberNameSortKey('   ')).toBe('2:');
    expect(buildTeamMemberNameSortKey(null)).toBe('2:');
    expect(buildTeamMemberNameSortKey(undefined)).toBe('2:');
    // Rare unmapped CJK and non-Latin scripts fall back to bucket 2 instead of bucket 0.
    expect(buildTeamMemberNameSortKey('𠮷田').startsWith('2:')).toBe(true);
    expect(buildTeamMemberNameSortKey('こんにちは').startsWith('2:')).toBe(true);

    const longKey = buildTeamMemberNameSortKey('张'.repeat(500));
    expect(Buffer.byteLength(longKey, 'utf8')).toBeLessThan(512);
    expect(isValidTeamMemberNameSortKey(longKey)).toBe(true);
    expect(isValidTeamMemberNameSortKey('')).toBe(false);
    expect(isValidTeamMemberNameSortKey(null)).toBe(false);
    expect(isValidTeamMemberNameSortKey('0:legacy')).toBe(false);
    expect(isValidTeamMemberNameSortKey('9:invalid')).toBe(false);
  });
});
