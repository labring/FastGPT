import type { OpenAPIPath } from '../../../../type';
import { TagsMap } from '../../../../tag';
import {
  UpdatePasswordByOldBodySchema,
  UpdatePasswordByOldResponseSchema,
  CheckPswExpiredResponseSchema,
  ResetExpiredPswBodySchema,
  ResetExpiredPswResponseSchema,
  UpdatePasswordByCodeBodySchema
} from './api';

export const PasswordPath: OpenAPIPath = {
  '/support/user/account/updatePasswordByOld': {
    post: {
      summary: '通过旧密码修改密码',
      description: '使用旧密码验证后修改为新密码，修改成功后其他会话将被注销',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePasswordByOldBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '密码修改成功',
          content: {
            'application/json': {
              schema: UpdatePasswordByOldResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/checkPswExpired': {
    get: {
      summary: '检查密码是否过期',
      description: '检查当前用户的密码是否已过期，需要强制修改',
      tags: [TagsMap.userLogin],
      responses: {
        200: {
          description: '返回密码是否过期',
          content: {
            'application/json': {
              schema: CheckPswExpiredResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/resetExpiredPsw': {
    post: {
      summary: '重置过期密码',
      description: '当密码过期时，使用此接口重置密码，重置后其他会话将被注销',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: ResetExpiredPswBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '密码重置成功',
          content: {
            'application/json': {
              schema: ResetExpiredPswResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/password/updateByCode': {
    post: {
      summary: '通过验证码找回/修改密码',
      description: '通过邮箱/手机验证码找回或修改密码',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePasswordByCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '修改成功',
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
