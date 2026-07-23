import z from 'zod';
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

export const PasswordPath: OpenAPIPath = {
  '/proApi/support/user/account/password/authorization': {
    post: {
      summary: '获取修改密码授权',
      description: '通过当前账号的唯一身份验证方式签发短期改密授权',
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
      description: '创建绑定当前用户和 passwordChange 场景的验证材料',
      tags: [DevApiTagsMap.userLogin, 'Account Verification'],
      requestBody: {
        content: { 'application/json': { schema: CreatePasswordVerificationBodySchema } }
      },
      responses: {
        200: {
          description: '验证材料已创建',
          content: { 'application/json': { schema: CreatePasswordVerificationResponseSchema } }
        },
        400: {
          description: '请求参数或验证码错误',
          content: { 'application/json': { schema: z.null() } }
        }
      }
    }
  },
  '/support/user/account/password/update': {
    post: {
      summary: '设置或修改密码',
      description: '使用当前 Session 和短期改密授权设置或修改密码，并注销其他 Session',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: { 'application/json': { schema: UpdatePasswordBodySchema } }
      },
      responses: {
        200: {
          description: '密码设置成功',
          content: { 'application/json': { schema: UpdatePasswordResponseSchema } }
        },
        400: {
          description: '新密码与当前密码相同',
          content: { 'application/json': { schema: z.null() } }
        }
      }
    }
  },
  '/support/user/account/checkPswExpired': {
    get: {
      summary: '检查密码是否过期',
      description: '无密码账号直接返回 false；有密码账号沿用原密码更新时间规则',
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '返回密码是否过期',
          content: { 'application/json': { schema: CheckPswExpiredResponseSchema } }
        }
      }
    }
  },
  '/support/user/account/password/updateByCode': {
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
          content: { 'application/json': { schema: {} } }
        },
        400: {
          description: '请求参数、验证码错误或新密码与当前密码相同',
          content: { 'application/json': { schema: z.null() } }
        },
        429: {
          description: '验证码校验过于频繁',
          content: { 'application/json': { schema: z.null() } }
        }
      }
    }
  }
};
