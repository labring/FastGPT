import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AccountCancellationStatusResponseSchema,
  CancelAccountCancellationResponseSchema,
  CreateAccountCancellationVerificationBodySchema,
  CreateAccountCancellationVerificationResponseSchema,
  SubmitAccountCancellationBodySchema,
  SubmitAccountCancellationResponseSchema
} from './api';

export const AccountCancellationPath: OpenAPIPath = {
  '/proApi/support/user/account/cancellation/status': {
    get: {
      summary: '获取账号注销状态',
      description: '获取当前登录账号的注销状态和申请资格',
      tags: [DevApiTagsMap.userLogin, 'Account Cancellation'],
      responses: {
        200: {
          description: '注销状态',
          content: { 'application/json': { schema: AccountCancellationStatusResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/user/account/cancellation/verification/create': {
    post: {
      summary: '创建账号注销验证材料',
      description: '创建绑定当前登录账号和 accountCancellation scene 的短期验证材料',
      tags: [DevApiTagsMap.userLogin, 'Account Verification', 'Account Cancellation'],
      requestBody: {
        content: { 'application/json': { schema: CreateAccountCancellationVerificationBodySchema } }
      },
      responses: {
        200: {
          description: '验证材料已创建',
          content: {
            'application/json': { schema: CreateAccountCancellationVerificationResponseSchema }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/cancellation/submit': {
    post: {
      summary: '提交账号注销申请',
      description: '在同一请求中消费注销验证材料并创建注销等待期记录',
      tags: [DevApiTagsMap.userLogin, 'Account Cancellation'],
      requestBody: {
        content: { 'application/json': { schema: SubmitAccountCancellationBodySchema } }
      },
      responses: {
        200: {
          description: '验证进行中或已进入注销等待期',
          content: { 'application/json': { schema: SubmitAccountCancellationResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/user/account/cancellation/cancel': {
    delete: {
      summary: '取消账号注销',
      description: '在最终清理开始前取消当前账号的注销申请',
      tags: [DevApiTagsMap.userLogin, 'Account Cancellation'],
      responses: {
        200: {
          description: '取消成功',
          content: { 'application/json': { schema: CancelAccountCancellationResponseSchema } }
        }
      }
    }
  }
};
