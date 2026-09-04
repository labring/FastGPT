import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  CheckPswExpiredResponseSchema,
  CreatePasswordVerificationBodySchema,
  CreatePasswordVerificationResponseSchema,
  PasswordAuthorizationBodySchema,
  PasswordAuthorizationResponseSchema,
  UpdatePasswordBodySchema,
  UpdatePasswordByCodeBodySchema,
  UpdatePasswordResponseSchema
} from './api';
import { LoginSuccessResponseSchema } from '../login/api';

export const PasswordPath: OpenAPIPath = {
  '/proApi/support/user/account/password/authorization': {
    post: {
      summary: '获取修改密码授权',
      description: '解析当前账号的唯一验证方式，或消费验证材料后创建一次性改密 Session',
      tags: [DevApiTagsMap.userLogin, 'Account Verification'],
      requestBody: {
        content: { 'application/json': { schema: PasswordAuthorizationBodySchema } }
      },
      responses: {
        200: {
          description: '授权结果',
          content: { 'application/json': { schema: PasswordAuthorizationResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/user/account/password/verification/create': {
    post: {
      summary: '创建修改密码验证材料',
      description: '创建绑定当前用户和 changePassword 场景的验证材料',
      tags: [DevApiTagsMap.userLogin, 'Account Verification'],
      requestBody: {
        content: { 'application/json': { schema: CreatePasswordVerificationBodySchema } }
      },
      responses: {
        200: {
          description: '验证材料已创建',
          content: { 'application/json': { schema: CreatePasswordVerificationResponseSchema } }
        }
      }
    }
  },
  '/support/user/account/password/update': {
    post: {
      summary: '设置或修改密码',
      description: '使用当前 Session 和一次性改密 Session 设置或修改密码，并注销其他 Session',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: { 'application/json': { schema: UpdatePasswordBodySchema } }
      },
      responses: {
        200: {
          description: '密码设置成功',
          content: { 'application/json': { schema: UpdatePasswordResponseSchema } }
        }
      }
    }
  },
  '/support/user/account/checkPswExpired': {
    get: {
      summary: '检查密码是否过期',
      description: '无密码账号和 root 返回 false；其他账号按密码更新时间规则判断',
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '返回密码是否过期',
          content: { 'application/json': { schema: CheckPswExpiredResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/user/account/password/updateByCode': {
    post: {
      summary: '通过验证码找回/修改密码',
      description: '通过邮箱/手机验证码找回或修改密码',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: { 'application/json': { schema: UpdatePasswordByCodeBodySchema } }
      },
      responses: {
        200: {
          description: '修改成功',
          content: { 'application/json': { schema: LoginSuccessResponseSchema } }
        }
      }
    }
  }
};
