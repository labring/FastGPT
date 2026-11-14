import { z } from 'zod';
import {
  AccountContactUsernameSchema,
  CaptchaVerificationPurposeSchema
} from '../../../../../support/user/account/verification/type';
import {
  type PuzzleCaptchaResultSchema,
  type PuzzleCaptchaChallengeSchema,
  PuzzleCaptchaSubmissionSchema
} from '../../../../../support/user/account/captcha/type';

/* ============================================================================
 * API: 获取旋转图像验证码
 * Routes: GET /api/support/user/account/captcha/getImgCaptcha
 *         GET /proApi/support/user/account/captcha/getImgCaptcha
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
