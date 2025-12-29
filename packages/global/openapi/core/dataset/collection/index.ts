import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { ExportCollectionChunksBodySchema } from './api';

export const DatasetCollectionChunksPath: OpenAPIPath = {
  '/core/dataset/collection/exportChunks': {
    post: {
      summary: '导出并下载集合的所有数据块',
      description: '导出并下载集合的所有数据块',
      tags: [TagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ExportCollectionChunksBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出并下载集合的所有数据块内容',
          content: null
        }
      }
    }
  }
};
