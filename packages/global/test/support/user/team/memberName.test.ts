import { describe, expect, it } from 'vitest';
import {
  getTeamMemberDisplayName,
  getValidTeamMemberName,
  normalizeTeamMemberName,
  TeamMemberNameSchema
} from '@fastgpt/global/support/user/team/memberName';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import type { TeamMemberName } from '@fastgpt/global/support/user/team/memberName';

describe('TeamMemberNameSchema', () => {
  it('trims and accepts names up to 20 characters', () => {
    expect(TeamMemberNameSchema.parse('  Alice  ')).toBe('Alice');
    expect(TeamMemberNameSchema.parse('a'.repeat(20))).toBe('a'.repeat(20));
  });

  it('rejects empty, overlong, and reserved names', () => {
    expect(TeamMemberNameSchema.safeParse('   ').success).toBe(false);
    expect(TeamMemberNameSchema.safeParse('a'.repeat(21)).success).toBe(false);
    expect(TeamMemberNameSchema.safeParse(UNSET_TEAM_MEMBER_NAME).success).toBe(false);
  });

  it('separates strict normalization from fallback validation', () => {
    expect(normalizeTeamMemberName(' Bob ')).toBe('Bob');
    expect(getValidTeamMemberName(UNSET_TEAM_MEMBER_NAME)).toBeUndefined();
    expect(getValidTeamMemberName('')).toBeUndefined();
  });

  it('infers the member name type from the schema', () => {
    const name: TeamMemberName = TeamMemberNameSchema.parse('Alice');
    expect(name).toBe('Alice');
  });
});

describe('getTeamMemberDisplayName', () => {
  it('returns the member name when it is already set', () => {
    expect(getTeamMemberDisplayName({ memberName: '张三', username: 'zhangsan' })).toBe('张三');
  });

  it('never leaks the reserved pending placeholder', () => {
    expect(
      getTeamMemberDisplayName({ memberName: UNSET_TEAM_MEMBER_NAME, username: 'zhangsan' })
    ).toBe('zhangsan');
    expect(getTeamMemberDisplayName({ memberName: UNSET_TEAM_MEMBER_NAME })).toBe('');
  });

  it('falls back to the username while the member name is still loading', () => {
    expect(getTeamMemberDisplayName({ username: 'zhangsan' })).toBe('zhangsan');
    expect(getTeamMemberDisplayName({ memberName: '', username: '' })).toBe('');
  });

  it('uses the caller supplied fallback when nothing else is available', () => {
    expect(getTeamMemberDisplayName({ fallback: 'Anonymous' })).toBe('Anonymous');
  });
});
