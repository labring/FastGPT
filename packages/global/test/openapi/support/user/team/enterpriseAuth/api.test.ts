import { describe, expect, it } from 'vitest';
import { VerifyEnterpriseAuthAmountBodySchema } from '../../../../../../openapi/support/user/team/enterpriseAuth/api';

describe('VerifyEnterpriseAuthAmountBodySchema', () => {
  it('只接受严格正整数金额，避免无效金额消耗验证次数', () => {
    expect(
      VerifyEnterpriseAuthAmountBodySchema.parse({
        taskId: 'task-1',
        amountFen: 123
      })
    ).toEqual({
      taskId: 'task-1',
      amountFen: 123
    });

    [0, -1, 1.5, '', '123', null, undefined, false].forEach((amountFen) => {
      expect(
        VerifyEnterpriseAuthAmountBodySchema.safeParse({
          taskId: 'task-1',
          amountFen
        }).success
      ).toBe(false);
    });
  });
});
