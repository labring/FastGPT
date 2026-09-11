import { describe, expect, it } from 'vitest';
import {
  getValidTeamMemberName,
  normalizeTeamMemberName,
  TeamMemberNameSchema
} from '@fastgpt/global/support/user/team/memberName';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';

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
});
