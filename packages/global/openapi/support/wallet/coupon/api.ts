import z from 'zod';

export const RedeemCouponQuerySchema = z.object({
  key: z.string().trim().min(1).meta({
    description: '兑换码',
    example: 'AbCdEfGhIjKlMnOpQrStUvWx'
  })
});
export type RedeemCouponQueryType = z.infer<typeof RedeemCouponQuerySchema>;

export const RedeemCouponResponseSchema = z.undefined().meta({ description: '兑换成功' });
export type RedeemCouponResponseType = z.infer<typeof RedeemCouponResponseSchema>;
