import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetApiDatasetCatalogBodySchema,
  GetApiDatasetFileListBodySchema,
  GetApiDatasetFileListExistIdQuerySchema,
  GetApiDatasetPathNamesBodySchema
} from './api';

export const ApiDatasetPath: OpenAPIPath = {
  '/core/dataset/apiDataset/getCatalog': {
    post: {
      summary: '获取第三方知识库目录',
      description:
        '列出第三方知识库（API/飞书/语雀）的目录节点，仅返回包含子节点的文件夹，用于构建目录选择器',
      tags: [TagsMap.datasetApiDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: GetApiDatasetCatalogBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回目录节点列表'
        }
      }
    }
  },
  '/core/dataset/apiDataset/getPathNames': {
    post: {
      summary: '获取第三方知识库节点路径',
      description: '根据节点 ID 沿父级链向上查找，拼接出完整路径字符串，用于面包屑或路径展示',
      tags: [TagsMap.datasetApiDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: GetApiDatasetPathNamesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回节点的完整路径'
        }
      }
    }
  },
  '/core/dataset/apiDataset/list': {
    post: {
      summary: '获取第三方知识库文件列表',
      description: '列出指定知识库下的第三方文件/文件夹，支持关键词与父级筛选',
      tags: [TagsMap.datasetApiDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: GetApiDatasetFileListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回文件/文件夹列表'
        }
      }
    }
  },
  '/core/dataset/apiDataset/listExistId': {
    get: {
      summary: '获取已导入的第三方文件 ID 列表',
      description: '返回指定知识库下已创建集合所对应的 apiFileId，用于导入时的去重判断',
      tags: [TagsMap.datasetApiDataset],
      requestParams: {
        query: GetApiDatasetFileListExistIdQuerySchema
      },
      responses: {
        200: {
          description: '成功返回已存在的 apiFileId 列表'
        }
      }
    }
  }
};
