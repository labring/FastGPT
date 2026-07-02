import { describe, expect, it } from 'vitest';
import {
  StartEnterpriseAuthBodySchema,
  VerifyEnterpriseAuthAmountBodySchema
} from '../../../../../../openapi/support/user/team/enterpriseAuth/api';

describe('VerifyEnterpriseAuthAmountBodySchema', () => {
  it('只接受严格正整数金额，避免无效金额消耗验证次数', () => {
    expect(
      VerifyEnterpriseAuthAmountBodySchema.parse({
        taskId: 'task-1',
        amountCent: 123
      })
    ).toEqual({
      taskId: 'task-1',
      amountCent: 123
    });

    [0, -1, 1.5, '', '123', null, undefined, false].forEach((amountCent) => {
      expect(
        VerifyEnterpriseAuthAmountBodySchema.safeParse({
          taskId: 'task-1',
          amountCent
        }).success
      ).toBe(false);
    });
  });
});

describe('StartEnterpriseAuthBodySchema', () => {
  const validBody = {
    enterpriseName: '示例科技有限公司',
    unifiedCreditCode: '91310000MA1K000006',
    legalPersonName: '张三',
    bankAccount: '4111 1111 1111 1111',
    bankName: '中国工商银行',
    contactName: '李四',
    contactTitle: '产品负责人',
    contactPhone: '13800000000',
    demand: '企业知识库试用'
  };

  it('按 GB 32100-2015 校验统一社会信用代码，并规范化大小写', () => {
    expect(
      StartEnterpriseAuthBodySchema.parse({
        ...validBody,
        unifiedCreditCode: '91310000ma1k000006'
      }).unifiedCreditCode
    ).toBe('91310000MA1K000006');

    expect(
      StartEnterpriseAuthBodySchema.safeParse({
        ...validBody,
        unifiedCreditCode: '91310000MA1K000000'
      }).success
    ).toBe(false);
  });

  it('银行账号需为 15-19 位数字，并在入参解析时去除空格', () => {
    expect(StartEnterpriseAuthBodySchema.parse(validBody).bankAccount).toBe('4111111111111111');
    expect(
      StartEnterpriseAuthBodySchema.parse({
        ...validBody,
        bankAccount: '571919104910201'
      }).bankAccount
    ).toBe('571919104910201');

    ['4111-1111-1111-1111', '1'.repeat(14), '1'.repeat(20)].forEach((bankAccount) => {
      expect(
        StartEnterpriseAuthBodySchema.safeParse({
          ...validBody,
          bankAccount
        }).success
      ).toBe(false);
    });
  });
});
