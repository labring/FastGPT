import {
  PuzzleCaptchaChallengeSchema,
  PuzzleCaptchaResultSchema
} from '../../../../../support/user/account/captcha/type';
import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  GetImgCaptchaQuerySchema,
  GetPuzzleCaptchaQuerySchema,
  VerifyPuzzleCaptchaBodySchema
} from './api';

export const CaptchaPath: OpenAPIPath = {
  '/support/user/account/captcha/getImgCaptcha': {
    get: {
      summary: '获取一次性旋转图像挑战',
      tags: [DevApiTagsMap.userLogin],
      requestParams: { query: GetPuzzleCaptchaQuerySchema },
      responses: {
        200: {
          description: '旋转图像挑战',
          content: { 'application/json': { schema: PuzzleCaptchaChallengeSchema } }
        }
      }
    }
  },
  '/support/user/account/captcha/verify': {
    post: {
      summary: '校验一次性旋转图像挑战',
      description:
        '每张图片最多尝试三次，前两次失败返回剩余次数，第三次失败需换图；成功签发 30 秒有效凭证。',
      tags: [DevApiTagsMap.userLogin],
      requestBody: { content: { 'application/json': { schema: VerifyPuzzleCaptchaBodySchema } } },
      responses: {
        200: {
          description: '验证结果：通过、重试或换图',
          content: { 'application/json': { schema: PuzzleCaptchaResultSchema } }
        }
      }
    }
  },
  '/proApi/support/user/account/captcha/getImgCaptcha': {
    get: {
      summary: '获取旋转图像验证码',
      description: '为指定账号和业务场景生成旋转图像验证码',
      tags: [DevApiTagsMap.userLogin],
      requestParams: {
        query: GetImgCaptchaQuerySchema
      },
      responses: {
        200: {
          description: '获取旋转图像验证码成功',
          content: {
            'application/json': {
              schema: PuzzleCaptchaChallengeSchema
            }
          }
        }
      }
    }
  }
};
