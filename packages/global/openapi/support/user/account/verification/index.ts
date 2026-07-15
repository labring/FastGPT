import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  GetAccountCaptchaQuerySchema,
  GetAccountCaptchaResponseSchema,
  SendAccountVerificationCodeBodySchema,
  SendAccountVerificationCodeResponseSchema
} from './api';

export const AccountVerificationPath: OpenAPIPath = {
  '/proApi/support/user/account/captcha/getImgCaptcha': {
    get: {
      summary: '获取账号图片验证码',
      description: '获取发送邮箱或短信验证码前的人机校验图片',
      tags: [DevApiTagsMap.userLogin],
      requestParams: {
        query: GetAccountCaptchaQuerySchema
      },
      responses: {
        200: {
          description: '成功创建图片验证码',
          content: {
            'application/json': {
              schema: GetAccountCaptchaResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/sendAuthCode': {
    post: {
      summary: '发送账号验证码',
      description: '消费图片验证码后，按注册、找回密码或绑定场景发送邮箱/短信验证码',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: SendAccountVerificationCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '验证码发送成功',
          content: {
            'application/json': {
              schema: SendAccountVerificationCodeResponseSchema
            }
          }
        }
      }
    }
  }
};
