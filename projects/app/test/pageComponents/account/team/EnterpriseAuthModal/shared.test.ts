import { describe, expect, it } from 'vitest';
import {
  BankAccountPattern,
  fieldRules,
  formatEnterpriseAuthBankOptions,
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

describe('formatEnterpriseAuthBankOptions', () => {
  it('下拉展示和提交银行简称，银行公司全称作为搜索别名', () => {
    expect(
      formatEnterpriseAuthBankOptions({
        中国工商银行: '中国工商银行股份有限公司',
        北京银行: '北京银行股份有限公司'
      })
    ).toEqual([
      {
        label: '中国工商银行',
        value: '中国工商银行',
        alias: '中国工商银行股份有限公司'
      },
      {
        label: '北京银行',
        value: '北京银行',
        alias: '北京银行股份有限公司'
      }
    ]);
  });
});
