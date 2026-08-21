import z from 'zod';

/* ============================================================================
 * API: 兑换优惠码
 * Route: GET /api/proApi/support/wallet/coupon/redeem
 * Method: GET
 * Description: 使用团队兑换码兑换订阅、积分或数据集容量。
 * Tags: ['优惠券']
 * ============================================================================ */

export const RedeemCouponQuerySchema = z.object({
  key: z.string().trim().min(1).meta({
    description: '兑换码',
    example: 'AbCdEfGhIjKlMnOpQrStUvWx'
  })
});
export type RedeemCouponQueryType = z.infer<typeof RedeemCouponQuerySchema>;

export const RedeemCouponResponseSchema = z.undefined().meta({ description: '兑换成功' });
export type RedeemCouponResponseType = z.infer<typeof RedeemCouponResponseSchema>;
