import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { WhoamiResponseSchema } from './api';

export const WhoamiPath: OpenAPIPath = {
  '/support/user/account/whoami': {
    get: {
      summary: '获取当前鉴权凭据主体信息',
      description:
        '支持通过 token/Cookie 传入 Session Token 或通过 Authorization: Bearer 传入个人/应用 API Key，统一返回当前凭据的主体身份、团队上下文、权限摘要与有效期/积分限额。',
      tags: [DevApiTagsMap.userLogin, DevApiTagsMap.apiKey],
      responses: {
        200: {
          description: '成功返回当前鉴权凭据主体信息',
          content: {
            'application/json': {
              schema: WhoamiResponseSchema
            }
          }
        }
      }
    }
  }
};
