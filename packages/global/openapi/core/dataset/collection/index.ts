import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { ExportCollectionBodySchema } from './api';

export const DatasetCollectionPath: OpenAPIPath = {
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
