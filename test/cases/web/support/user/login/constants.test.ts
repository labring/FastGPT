import { describe, expect, it } from 'vitest';
import { LoginPageTypeEnum, checkPasswordRule } from '@/web/support/user/login/constants';

describe('LoginPageTypeEnum', () => {
  it('should have correct enum values', () => {
    expect(LoginPageTypeEnum.passwordLogin).toBe('passwordLogin');
    expect(LoginPageTypeEnum.register).toBe('register');
    expect(LoginPageTypeEnum.forgetPassword).toBe('forgetPassword');
    expect(LoginPageTypeEnum.wechat).toBe('wechat');
  });
});

describe('checkPasswordRule', () => {
  it('should return false for passwords shorter than 6 characters', () => {
    expect(checkPasswordRule('Ab1@')).toBe(false);
  });

  it('should return false for passwords longer than 100 characters', () => {
    const longPassword = 'A1@' + 'a'.repeat(98);
    expect(checkPasswordRule(longPassword)).toBe(false);
  });

  it('should return false for passwords with invalid characters', () => {
    expect(checkPasswordRule('Password{}123')).toBe(false);
    expect(checkPasswordRule('Password|123')).toBe(false);
    expect(checkPasswordRule('Password~123')).toBe(false);
  });

  it('should return false when only one pattern is matched', () => {
    expect(checkPasswordRule('123456')).toBe(false); // only digits
    expect(checkPasswordRule('abcdef')).toBe(false); // only lowercase
    expect(checkPasswordRule('ABCDEF')).toBe(false); // only uppercase
    expect(checkPasswordRule('!@#$%^')).toBe(false); // only special chars
  });

  it('should return true for valid passwords with at least 2 patterns', () => {
    expect(checkPasswordRule('Password123')).toBe(true); // uppercase, lowercase, digits
    expect(checkPasswordRule('pass123@')).toBe(true); // lowercase, digits, special
    expect(checkPasswordRule('PASS123@')).toBe(true); // uppercase, digits, special
    expect(checkPasswordRule('Pass@word')).toBe(true); // uppercase, lowercase, special
    expect(checkPasswordRule('Pa@123')).toBe(true); // minimum valid length
  });
});
