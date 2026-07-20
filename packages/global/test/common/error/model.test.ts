import couponErr, { CouponErrEnum } from '@fastgpt/global/common/error/code/coupon';
import modelErr, { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { describe, expect, it } from 'vitest';

describe('model error codes', () => {
  it('uses the dedicated model range without colliding with coupon errors', () => {
    const modelCodes = Object.values(modelErr).map(({ code }) => code);

    expect(modelCodes).toEqual(Array.from({ length: 13 }, (_, index) => 513000 + index));
    expect(modelCodes).not.toContain(couponErr[CouponErrEnum.invalid].code);
    expect(modelErr[ModelErrEnum.modelDisabled].code).toBe(513012);
  });
});
