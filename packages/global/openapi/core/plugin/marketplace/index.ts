import { type OpenAPIPath } from '../../../type';
import {
  GetMarketplaceDownloadUrlQuerySchema,
  GetMarketplaceDownloadUrlResponseSchema,
  GetMarketplaceDownloadUrlsBodySchema,
  GetMarketplaceDownloadUrlsResponseSchema,
  GetMarketplaceToolDetailQuerySchema,
  GetMarketplaceToolTagsResponseSchema,
  GetMarketplaceToolVersionsQuerySchema,
  GetMarketplaceToolVersionsResponseSchema,
  GetMarketplaceToolsBodySchema,
  MarketplaceToolDetailSchema,
  MarketplaceToolsResponseSchema
} from './api';
import { DevApiTagsMap } from '../../../tag';

export const MarketplacePath: OpenAPIPath = {
  '/marketplace/api/tool/list': {
    post: {
      summary: '获取工具列表',
      description: '分页查询 FastGPT 插件市场中的系统工具，支持关键词、标签和来源筛选',
      tags: [DevApiTagsMap.pluginMarketplace],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: GetMarketplaceToolsBodySchema
          }
        }
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
      summary: '获取工具详情',
      description: '获取指定市场工具或工具集子工具的详细配置',
      tags: [DevApiTagsMap.pluginMarketplace],
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
  '/marketplace/api/tool/getDownloadUrl': {
    get: {
      summary: '获取单个工具下载地址',
      description: '获取指定工具版本的插件包下载地址',
      tags: [DevApiTagsMap.pluginMarketplace],
      requestParams: {
        query: GetMarketplaceDownloadUrlQuerySchema
      },
      responses: {
        200: {
          description: '获取工具下载地址成功',
          content: {
            'application/json': {
              schema: GetMarketplaceDownloadUrlResponseSchema
            }
          }
        }
      }
    },
    post: {
      summary: '批量获取工具下载地址',
      description: '根据工具 ID 列表批量获取插件包下载地址',
      tags: [DevApiTagsMap.pluginMarketplace],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: GetMarketplaceDownloadUrlsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '批量获取工具下载地址成功',
          content: {
            'application/json': {
              schema: GetMarketplaceDownloadUrlsResponseSchema
            }
          }
        }
      }
    }
  },
  '/marketplace/api/tool/tags': {
    get: {
      summary: '获取市场工具标签',
      description: '获取插件市场用于筛选系统工具的内置标签',
      tags: [DevApiTagsMap.pluginMarketplace],
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
      description: '获取全部市场工具版本，或按工具 ID 筛选版本',
      tags: [DevApiTagsMap.pluginMarketplace],
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
  }
};
