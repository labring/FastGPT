import { describe, expect, it } from 'vitest';
import {
  getValidTeamMemberName,
  normalizeTeamMemberName,
  resolveIsSetMemberName,
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

describe('resolveIsSetMemberName', () => {
  it('trusts the persisted flag when present', () => {
    expect(resolveIsSetMemberName({ memberName: 'Alice', isSetMemberName: false })).toBe(false);
    expect(
      resolveIsSetMemberName({ memberName: UNSET_TEAM_MEMBER_NAME, isSetMemberName: true })
    ).toBe(true);
  });

  it('infers legacy documents without the flag from the placeholder name', () => {
    expect(resolveIsSetMemberName({ memberName: UNSET_TEAM_MEMBER_NAME })).toBe(false);
    expect(resolveIsSetMemberName({ memberName: 'Alice' })).toBe(true);
    expect(resolveIsSetMemberName({})).toBe(true);
  });
});
