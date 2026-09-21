import { describe, expect, it } from 'vitest';
import type { TFunction } from 'next-i18next';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import { getMemberNameError } from '@/pageComponents/account/team/MemberNameForm/useMemberNameForm';

const mockT = ((key: string) => key) as TFunction;

describe('getMemberNameError', () => {
  it('accepts a valid member name and trims surrounding spaces', () => {
    expect(getMemberNameError({ value: '张三', t: mockT })).toBe('');
    expect(getMemberNameError({ value: '  张三  ', t: mockT })).toBe('');
  });

  it('asks for a name when the input is empty', () => {
    expect(getMemberNameError({ value: '', t: mockT })).toBe('account_team:member_name_required');
  });

  it('reports the length limit when the name exceeds 20 characters', () => {
    expect(getMemberNameError({ value: 'a'.repeat(21), t: mockT })).toBe(
      'account_team:member_name_limit'
    );
  });

  it('reports the length limit for the reserved pending placeholder', () => {
    expect(getMemberNameError({ value: UNSET_TEAM_MEMBER_NAME, t: mockT })).toBe(
      'account_team:member_name_limit'
    );
  });

  it('asks for a name when the name only contains spaces', () => {
    expect(getMemberNameError({ value: '   ', t: mockT })).toBe(
      'account_team:member_name_required'
    );
  });
});
