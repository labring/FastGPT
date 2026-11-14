import { z } from 'zod';
import {
  AccountContactUsernameSchema,
  AccountLoginUsernameSchema,
  CaptchaVerificationPurposeSchema
} from '../../../../../support/user/account/verification/type';
import {
  type PuzzleCaptchaResultSchema,
  type PuzzleCaptchaChallengeSchema,
  PuzzleCaptchaSubmissionSchema
} from '../../../../../support/user/account/captcha/type';

/* ============================================================================
 * API: 获取旋转图像验证码
 * Route: GET /proApi/support/user/account/captcha/getImgCaptcha
 * Method: GET
 * Description: 为指定账号和业务场景生成旋转图像验证码
 * Tags: ['User', 'Account', 'Verification']
 * ============================================================================ */

export const GetImgCaptchaQuerySchema = z.object({
  username: AccountContactUsernameSchema.meta({
    example: 'user@example.com',
    description: '待验证的账号'
  }),
  purpose: CaptchaVerificationPurposeSchema.meta({
    example: 'register',
    description: '旋转图像验证码业务场景'
  })
});
export type GetImgCaptchaQuery = z.infer<typeof GetImgCaptchaQuerySchema>;

export type GetImgCaptchaResponse = z.infer<typeof PuzzleCaptchaChallengeSchema>;

/* ============================================================================
 * API: 获取旋转图像挑战
 * Route: GET /api/support/user/account/captcha/getImgCaptcha
 * Method: GET
 * Description: 发送验证码使用 code 作用域，密码登录风险校验使用独立的 passwordLogin 作用域
 * Tags: ['User Login', 'Account Verification']
 * ============================================================================ */
export const GetPuzzleCaptchaQuerySchema = GetImgCaptchaQuerySchema.extend({
  username: AccountLoginUsernameSchema.meta({ description: '待验证账号' }),
  usage: z.enum(['code', 'passwordLogin']).optional().default('code').meta({
    description: '验证用途，密码登录用途仅允许 login 场景'
  })
}).refine((value) => value.usage !== 'passwordLogin' || value.purpose === 'login', {
  message: 'Password login captcha requires login purpose'
});
export type GetPuzzleCaptchaQuery = z.infer<typeof GetPuzzleCaptchaQuerySchema>;

/* ============================================================================
 * API: 校验一次性旋转图像挑战
 * Route: POST /api/support/user/account/captcha/verify
 * Method: POST
 * Description: 每张图最多三次；失败返回剩余次数或换图状态，成功消费本题并返回 30 秒有效凭证
 * Tags: ['User Login', 'Account Verification']
 * ============================================================================ */
export const VerifyPuzzleCaptchaBodySchema = PuzzleCaptchaSubmissionSchema.extend({
  purpose: CaptchaVerificationPurposeSchema.meta({ description: '挑战所属业务场景' })
});
export type VerifyPuzzleCaptchaBody = z.infer<typeof VerifyPuzzleCaptchaBodySchema>;
export type VerifyPuzzleCaptchaResponse = z.infer<typeof PuzzleCaptchaResultSchema>;
