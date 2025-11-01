import { type OpenAPIPath } from '../../../type';
import {
  GetMarketplaceToolDetailQuerySchema,
  GetMarketplaceToolsBodySchema,
  MarketplaceToolDetailSchema,
  MarketplaceToolsResponseSchema,
  GetMarketplaceToolTagsResponseSchema
} from './api';
import { TagsMap } from '../../../tag';

export const MarketplacePath: OpenAPIPath = {
  '/marketplace/api/tool/list': {
    get: {
      summary: '获取工具列表',
      tags: [TagsMap.pluginMarketplace],
      requestParams: {
        query: GetMarketplaceToolsBodySchema
      },
      responses: {
        200: {
          description: '获取市场工具列表成功',
          content: {
            'application/json': {
              schema: MarketplaceToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/marketplace/api/tool/detail': {
    get: {
      summary: '获取单个工具详情',
      tags: [TagsMap.pluginMarketplace],
      requestParams: {
        query: GetMarketplaceToolDetailQuerySchema
      },
      responses: {
        200: {
          description: '获取市场工具详情成功',
          content: {
            'application/json': {
              schema: MarketplaceToolDetailSchema
            }
          }
        }
      }
    }
  },
  '/marketplace/api/tool/tags': {
    get: {
      summary: '获取工具标签',
      tags: [TagsMap.pluginMarketplace],
      responses: {
        200: {
          description: '获取市场工具标签成功',
          content: {
            'application/json': {
              schema: GetMarketplaceToolTagsResponseSchema
            }
          }
        }
      }
    }
  }
};
