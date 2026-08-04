import { z } from 'zod';
import {
  CaptchaVerificationPurposeSchema,
  PublicAuthStringSchema
} from '../../../../../support/user/account/verification/type';

/* ============================================================================
 * API: 获取图片验证码
 * Route: GET /proApi/support/user/account/captcha/getImgCaptcha
 * Method: GET
 * Description: 为指定账号和业务场景生成图片验证码
 * Tags: ['User', 'Account', 'Verification']
 * ============================================================================ */

export const GetImgCaptchaQuerySchema = z.object({
  username: PublicAuthStringSchema.meta({
    example: 'user@example.com',
    description: '待验证的账号'
  }),
  purpose: CaptchaVerificationPurposeSchema.meta({
    example: 'register',
    description: '图片验证码业务场景'
  })
});
export type GetImgCaptchaQuery = z.infer<typeof GetImgCaptchaQuerySchema>;

export const GetImgCaptchaResponseSchema = z.object({
  captchaImage: z.string().meta({
    example: 'data:image/png;base64,...',
    description: 'Base64 编码的图片验证码'
  })
});
export type GetImgCaptchaResponse = z.infer<typeof GetImgCaptchaResponseSchema>;
