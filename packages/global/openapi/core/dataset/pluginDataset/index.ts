import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  ListPluginDatasetFilesBodySchema,
  ListPluginDatasetFilesResponseSchema,
  ListExistIdQuerySchema,
  ListExistIdResponseSchema,
  GetPathNamesBodySchema,
  GetPathNamesResponseSchema,
  GetCatalogBodySchema,
  GetCatalogResponseSchema,
  GetConfigQuerySchema,
  GetConfigResponseSchema
} from './api';

export const PluginDatasetPath: OpenAPIPath = {
  '/core/dataset/pluginDataset/list': {
    post: {
      summary: '列出插件数据源文件列表',
      description: '获取指定知识库的插件数据源文件列表，支持搜索和分层浏览',
      tags: [TagsMap.datasetPluginDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: ListPluginDatasetFilesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取文件列表',
          content: {
            'application/json': {
              schema: ListPluginDatasetFilesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/pluginDataset/listExistId': {
    get: {
      summary: '获取已同步的文件ID列表',
      description: '获取指定知识库中已同步的插件数据源文件ID列表',
      tags: [TagsMap.datasetPluginDataset],
      requestParams: {
        query: ListExistIdQuerySchema
      },
      responses: {
        200: {
          description: '成功获取已同步的文件ID列表',
          content: {
            'application/json': {
              schema: ListExistIdResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/pluginDataset/getPathNames': {
    post: {
      summary: '获取文件完整路径名',
      description: '根据文件ID获取文件的完整路径名称',
      tags: [TagsMap.datasetPluginDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPathNamesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取文件路径名',
          content: {
            'application/json': {
              schema: GetPathNamesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/pluginDataset/getCatalog': {
    post: {
      summary: '获取目录',
      description: '获取插件数据源的目录结构，只返回文件夹',
      tags: [TagsMap.datasetPluginDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: GetCatalogBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取目录结构',
          content: {
            'application/json': {
              schema: GetCatalogResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/pluginDataset/getConfig': {
    get: {
      summary: '获取插件数据源配置',
      description: '根据数据源ID获取插件数据源的表单配置信息',
      tags: [TagsMap.datasetPluginDataset],
      requestParams: {
        query: GetConfigQuerySchema
      },
      responses: {
        200: {
          description: '成功获取数据源配置',
          content: {
            'application/json': {
              schema: GetConfigResponseSchema
            }
          }
        }
      }
    }
  }
};
