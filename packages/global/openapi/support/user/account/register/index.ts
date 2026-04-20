import type { OpenAPIPath } from '../../../../type';
import { TagsMap } from '../../../../tag';
import { AccountRegisterBodySchema } from './api';

export const RegisterPath: OpenAPIPath = {
  '/support/user/account/register/emailAndPhone': {
    post: {
      summary: '邮箱/手机号注册',
      description: '使用邮箱或手机号验证码注册新账号',
      tags: [TagsMap.userLogin],
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
