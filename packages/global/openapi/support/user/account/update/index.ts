import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  UpdateContactBodySchema,
  UpdateContactResponseSchema,
  UpdateUserAccountBodySchema,
  UpdateUserAccountResponseSchema
} from './api';

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
  },
  '/proApi/support/user/account/updateContact': {
    put: {
      summary: '更新账号联系方式',
      description: '使用验证码更新当前用户的登录联系方式',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateContactBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '联系方式更新成功',
          content: {
            'application/json': {
              schema: UpdateContactResponseSchema
            }
          }
        }
      }
    }
  }
};
