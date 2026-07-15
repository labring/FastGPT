import { describe, expect, it } from 'vitest';
import {
  buildVerificationCodeFilter,
  escapeVerificationCodeForRegExp
} from '@fastgpt/service/support/user/account/verification/utils';

describe('escapeVerificationCodeForRegExp', () => {
  it('escapes every regular expression metacharacter', () => {
    expect(escapeVerificationCodeForRegExp('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
    );
  });
});

describe('buildVerificationCodeFilter', () => {
  it('uses an exact string for case-sensitive codes', () => {
    expect(buildVerificationCodeFilter({ code: '123456' })).toBe('123456');
  });

  it('builds an escaped and anchored filter for legacy case-insensitive codes', () => {
    const filter = buildVerificationCodeFilter({ code: 'a.b[c]', caseInsensitive: true });
    expect(filter.$regex.test('A.B[C]')).toBe(true);
    expect(filter.$regex.test('xa.b[c]')).toBe(false);
  });
});
