import { describe, expect, it } from 'vitest';
import {
  GetEnterpriseAuthStatusResponseSchema,
  StartEnterpriseAuthBodySchema,
  StartEnterpriseAuthResponseSchema,
  VerifyEnterpriseAuthAmountBodySchema
} from '../../../../../../openapi/support/user/team/enterpriseAuth/api';
import {
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '../../../../../../support/user/team/enterpriseAuth/constant';

describe('VerifyEnterpriseAuthAmountBodySchema', () => {
  it('只接受严格正整数金额，避免无效金额消耗验证次数', () => {
    expect(
      VerifyEnterpriseAuthAmountBodySchema.parse({
        amountCent: 123
      })
    ).toEqual({
      amountCent: 123
    });

    [0, -1, 1.5, '', '123', null, undefined, false].forEach((amountCent) => {
      expect(
        VerifyEnterpriseAuthAmountBodySchema.safeParse({
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

  it('银行账号不限制长度，并在入参解析时去除空格', () => {
    expect(StartEnterpriseAuthBodySchema.parse(validBody).bankAccount).toBe('4111111111111111');
    ['1', '1'.repeat(32)].forEach((bankAccount) => {
      expect(
        StartEnterpriseAuthBodySchema.parse({
          ...validBody,
          bankAccount
        }).bankAccount
      ).toBe(bankAccount);
    });

    ['', '   ', '4111-1111-1111-1111'].forEach((bankAccount) => {
      expect(
        StartEnterpriseAuthBodySchema.safeParse({
          ...validBody,
          bankAccount
        }).success
      ).toBe(false);
    });
  });
});

describe('EnterpriseAuth response schemas', () => {
  it('状态接口响应不再暴露 usedTimes', () => {
    const result = GetEnterpriseAuthStatusResponseSchema.parse({
      enabled: true,
      status: TeamEnterpriseAuthStatusEnum.unverified,
      usedTimes: 3,
      hasRemainingAuthTimes: false,
      canManage: true
    });

    expect(result).toEqual({
      enabled: true,
      status: TeamEnterpriseAuthStatusEnum.unverified,
      hasRemainingAuthTimes: false,
      canManage: true
    });
  });

  it('发起认证响应不再暴露 usedTimes', () => {
    const result = StartEnterpriseAuthResponseSchema.parse({
      status: TeamEnterpriseAuthStatusEnum.verifying,
      currentTask: {
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        amountErrorTimes: 0
      },
      usedTimes: 1,
      message: '已成功打款，请确认打款金额'
    });

    expect(result).toEqual({
      status: TeamEnterpriseAuthStatusEnum.verifying,
      currentTask: {
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        amountErrorTimes: 0
      },
      message: '已成功打款，请确认打款金额'
    });
  });
});
