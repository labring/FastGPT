import z from 'zod';
import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { AccountRegisterBodySchema } from './api';

export const RegisterPath: OpenAPIPath = {
  '/support/user/account/register/emailAndPhone': {
    post: {
      summary: '邮箱/手机号注册',
      description: '使用邮箱或手机号验证码注册新账号',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: AccountRegisterBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '注册成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        },
        400: {
          description: '请求参数或验证码错误',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        },
        429: {
          description: '验证码校验过于频繁',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        }
      }
    }
  }
};
