import { describe, expect, it } from 'vitest';
import {
  BankAccountPattern,
  fieldRules,
  formatBankAccountForDisplay,
  normalizeBankAccount
} from '../../../../../src/pageComponents/account/team/EnterpriseAuthModal/shared';

describe('enterprise auth bank account validation', () => {
  it('去除空格后校验 1-64 位数字银行账号', () => {
    expect(normalizeBankAccount(' 6222 0000 0000 0000 000 ')).toBe('6222000000000000000');
    expect(BankAccountPattern.test(normalizeBankAccount('6222 0000 0000 0000 000'))).toBe(true);
    expect(fieldRules.bankAccount.validate('6222 0000 0000 0000 000')).toBe(true);
  });

  it('银行账号包含非数字或超过 64 位时校验失败', () => {
    expect(fieldRules.bankAccount.validate('6222-0000')).toBe(false);
    expect(fieldRules.bankAccount.validate('1'.repeat(65))).toBe(false);
  });

  it('展示银行账号时按 4 位分组', () => {
    expect(formatBankAccountForDisplay('6222 0000 0000 0000 000')).toBe('6222 0000 0000 0000 000');
  });
});
