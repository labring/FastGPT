import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { UpdateUserAccountBodySchema, UpdateUserAccountResponseSchema } from './api';

export const UpdateUserAccountPath: OpenAPIPath = {
  '/support/user/account/update': {
    put: {
      summary: '更新用户账号信息',
      description: '更新当前用户的头像、时区或语言偏好',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateUserAccountBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateUserAccountResponseSchema
            }
          }
        }
      }
    }
  }
};
