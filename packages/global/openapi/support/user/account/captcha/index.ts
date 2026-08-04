import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { GetImgCaptchaQuerySchema, GetImgCaptchaResponseSchema } from './api';

export const CaptchaPath: OpenAPIPath = {
  '/proApi/support/user/account/captcha/getImgCaptcha': {
    get: {
      summary: '获取图片验证码',
      description: '为指定账号和业务场景生成图片验证码',
      tags: [DevApiTagsMap.userLogin],
      requestParams: {
        query: GetImgCaptchaQuerySchema
      },
      responses: {
        200: {
          description: '获取图片验证码成功',
          content: {
            'application/json': {
              schema: GetImgCaptchaResponseSchema
            }
          }
        }
      }
    }
  }
};

export * from './api';
