import { type OpenAPIPath } from '../../../type';
import {
  GetMarketplaceToolDetailQuerySchema,
  GetMarketplaceToolsBodySchema,
  MarketplaceToolDetailSchema,
  MarketplaceToolsResponseSchema,
  UploadMarketplacePkgBodySchema,
  UploadMarketplacePkgResponseSchema,
  GetMarketplaceToolTagsResponseSchema,
  GetMarketplaceToolVersionsQuerySchema,
  GetMarketplaceToolVersionsResponseSchema
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
  },
  '/marketplace/api/tool/versions': {
    get: {
      summary: '获取工具版本列表',
      tags: [TagsMap.pluginMarketplace],
      requestParams: {
        query: GetMarketplaceToolVersionsQuerySchema
      },
      responses: {
        200: {
          description: '获取工具版本列表成功',
          content: {
            'application/json': {
              schema: GetMarketplaceToolVersionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/marketplace/api/admin/pkg/upload': {
    post: {
      summary: '上传 marketplace 插件 pkg',
      tags: [TagsMap.pluginMarketplace],
      requestBody: {
        description: 'multipart/form-data, file 字段为 .pkg 文件',
        required: true,
        content: {
          'multipart/form-data': {
            schema: UploadMarketplacePkgBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '上传 marketplace 插件 pkg 成功',
          content: {
            'application/json': {
              schema: UploadMarketplacePkgResponseSchema
            }
          }
        }
      }
    }
  }
};
