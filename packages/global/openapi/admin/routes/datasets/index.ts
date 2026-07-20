import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { GetDatasetsResponseSchema } from './api';

export const AdminDatasetsPath: OpenAPIPath = {
  '/admin/routes/datasets/getDatasets': {
    post: {
      summary: '获取知识库列表',
      description: '分页获取知识库列表，包含每个知识库的数据量和向量量统计',
      tags: [DevApiTagsMap.adminDatasets],
      requestBody: {
        content: {
          'application/json': {
            schema: {}
          }
        }
      },
      responses: {
        200: {
          description: '成功获取知识库列表',
          content: {
            'application/json': {
              schema: GetDatasetsResponseSchema
            }
          }
        }
      }
    }
  }
};
