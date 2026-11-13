import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import { GetDatasetsBodySchema, GetDatasetsResponseSchema } from './api';
import { AdminDatasetTrainingPath } from './training';

export const AdminDatasetsPath: OpenAPIPath = {
  ...AdminDatasetTrainingPath,
  '/proApi/admin/dataset/getDatasets': {
    post: {
      summary: '获取知识库列表',
      description:
        '分页获取知识库列表，包含每个知识库的数据量和向量量统计，支持按创建者用户名、团队名称、知识库名称模糊搜索及团队ID、知识库ID精确搜索',
      tags: [DevApiTagsMap.adminDatasets],
      requestBody: {
        content: {
          'application/json': {
            schema: GetDatasetsBodySchema
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
