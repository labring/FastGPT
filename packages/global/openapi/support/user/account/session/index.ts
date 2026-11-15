import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  RefreshSessionBodySchema,
  RefreshSessionResponseSchema,
  SessionStatusResponseSchema
} from './api';

export const SessionPath: OpenAPIPath = {
  '/support/user/account/session/refresh': {
    post: {
      summary: '自动续约用户会话',
      tags: [DevApiTagsMap.userLogin],
      requestBody: { content: { 'application/json': { schema: RefreshSessionBodySchema } } },
      responses: {
        200: {
          description: '返回生命周期；浏览器凭证仅经 Cookie 更新',
          content: { 'application/json': { schema: RefreshSessionResponseSchema } }
        }
      }
    }
  },
  '/support/user/account/session/status': {
    get: {
      summary: '查询登录生命周期',
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '旧单 Token 的 session 为 null',
          content: { 'application/json': { schema: SessionStatusResponseSchema } }
        }
      }
    }
  },
  '/support/user/account/session/logout': {
    post: {
      summary: '退出当前账号的全部设备会话',
      tags: [DevApiTagsMap.userLogin],
      requestBody: { content: { 'application/json': { schema: RefreshSessionBodySchema } } },
      responses: { 200: { description: '已撤销全部会话并清理会话 Cookie' } }
    }
  }
};
