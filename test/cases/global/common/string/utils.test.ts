import { describe, expect, it } from 'vitest';
import { checkPasswordRule } from '@/web/support/user/login/constants';

describe('PasswordRule', () => {
  it('should be a valid password', () => {
    // Small password
    expect(checkPasswordRule('123A')).toBe(false);
    expect(checkPasswordRule('@ga21')).toBe(false);

    // Test single type characters
    expect(checkPasswordRule('123456')).toBe(false);
    expect(checkPasswordRule('abcdef')).toBe(false); // only lowercase
    expect(checkPasswordRule('ABCDEF')).toBe(false); // only uppercase
    expect(checkPasswordRule('!@#$%^')).toBe(false); // only special chars

    // Test two types combination
    expect(checkPasswordRule('abc123')).toBe(true); // lowercase + numbers
    expect(checkPasswordRule('abcABC')).toBe(true); // lowercase + uppercase
    expect(checkPasswordRule('abc!@#')).toBe(true); // lowercase + special chars
    expect(checkPasswordRule('ABC!@#')).toBe(true); // uppercase + special chars
    expect(checkPasswordRule('ABC123')).toBe(true); // uppercase + numbers
    expect(checkPasswordRule('123!@#')).toBe(true); // numbers + special chars
    expect(checkPasswordRule('!@123fa')).toBe(true); // numbers + special chars
    expect(checkPasswordRule('+2222()222')).toBe(true); // special chars + numbers
    expect(checkPasswordRule('_2222()-+=22')).toBe(true); // special chars + numbers

    // Test three types combination
    expect(checkPasswordRule('abcABC123')).toBe(true); // lower + upper + numbers
    expect(checkPasswordRule('abc123!@#')).toBe(true); // lower + numbers + special
    expect(checkPasswordRule('abc!@#123')).toBe(true); // lower + special + numbers

    // Test all four types
    expect(checkPasswordRule('abcABC123!@#')).toBe(true); // all types
  });
});
