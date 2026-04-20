import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import { OutLinkListQuerySchema } from './api';

export const OutLinkPath: OpenAPIPath = {
  '/support/outLink/list': {
    get: {
      summary: '获取应用的发布渠道列表',
      description: '查询指定应用的所有 OutLink 发布渠道配置',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: OutLinkListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回发布渠道列表'
        }
      }
    }
  }
};
