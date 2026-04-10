import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  ExportCollectionBodySchema,
  ScrollCollectionsBodySchema,
  UpdateDatasetCollectionBodySchema
} from './api';

export const DatasetCollectionPath: OpenAPIPath = {
  '/core/dataset/collection/scrollList': {
    post: {
      summary: '获取数据集集合列表（滚动分页）',
      description: '获取数据集集合列表（滚动分页）',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ScrollCollectionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合列表'
        }
      }
    }
  },
  '/core/dataset/collection/update': {
    post: {
      summary: '更新数据集集合信息',
      description: '更新数据集集合信息，支持通过集合ID或数据集ID+外部文件ID定位集合',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新集合信息'
        }
      }
    }
  },
  '/core/dataset/collection/export': {
    post: {
      summary: '下载集合的所有数据块',
      description: '下载集合的所有数据块',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ExportCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出并下载集合的所有数据块内容'
        }
      }
    }
  }
};
