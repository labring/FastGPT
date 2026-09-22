import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { GetPaysBodySchema, GetPaysResponseSchema } from './api';

export const AdminPayPath: OpenAPIPath = {
  '/proApi/admin/wallet/pay/getPays': {
    post: {
      summary: '获取订单列表',
      description: '分页获取订单列表，支持按用户名搜索和按类型/状态筛选',
      tags: [DevApiTagsMap.adminPays],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPaysBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取订单列表',
          content: {
            'application/json': {
              schema: GetPaysResponseSchema
            }
          }
        }
      }
    }
  }
};
