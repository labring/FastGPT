import { describe, expect, it } from 'vitest';
import {
  fieldRules,
  formatEnterpriseAuthBankOptions,
  formatBankAccountForDisplay,
  normalizeBankAccount
} from '../../../../../src/pageComponents/account/team/EnterpriseAuth/shared';

describe('enterprise auth bank account validation', () => {
  it('去除空格后校验 15-19 位数字银行账号', () => {
    expect(normalizeBankAccount(' 4111 1111 1111 1111 ')).toBe('4111111111111111');
    expect(fieldRules.bankAccount.validate('4111 1111 1111 1111')).toBe(true);
    expect(fieldRules.bankAccount.validate('571919104910201')).toBe(true);
  });

  it('银行账号包含非数字或长度不符时校验失败', () => {
    expect(fieldRules.bankAccount.validate('4111-1111-1111-1111')).toBe(false);
    expect(fieldRules.bankAccount.validate('1'.repeat(14))).toBe(false);
    expect(fieldRules.bankAccount.validate('1'.repeat(20))).toBe(false);
  });

  it('统一社会信用代码按 GB 32100-2015 校验第 18 位', () => {
    expect(fieldRules.unifiedCreditCode.validate('91310000ma1k000006')).toBe(true);
    expect(fieldRules.unifiedCreditCode.validate('91310000MA1K000000')).toBe(false);
    expect(fieldRules.unifiedCreditCode.validate('91310000MA1K00000I')).toBe(false);
  });

  it('展示银行账号时按 4 位分组', () => {
    expect(formatBankAccountForDisplay('4111111111111111')).toBe('4111 1111 1111 1111');
  });
});

describe('formatEnterpriseAuthBankOptions', () => {
  it('下拉只展示和提交银行简称', () => {
    expect(
      formatEnterpriseAuthBankOptions({
        中国工商银行: '中国工商银行股份有限公司',
        北京银行: '北京银行股份有限公司'
      })
    ).toEqual([
      {
        label: '中国工商银行',
        value: '中国工商银行'
      },
      {
        label: '北京银行',
        value: '北京银行'
      }
    ]);
  });
});
