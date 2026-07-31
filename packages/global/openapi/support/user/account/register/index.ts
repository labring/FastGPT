import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { AccountRegisterBodySchema } from './api';
import { SendAuthCodeResponseSchema, SendRegisterAuthCodeBodySchema } from '../../inform/api';

export const RegisterPath: OpenAPIPath = {
  '/proApi/support/user/account/register/sendAuthCode': {
    post: {
      summary: '发送注册验证码',
      description: '发送注册使用的邮箱或手机号验证码',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: SendRegisterAuthCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '验证码发送成功',
          content: {
            'application/json': {
              schema: SendAuthCodeResponseSchema
            }
          }
        }
      }
    }
  },
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
        }
      }
    }
  }
};
