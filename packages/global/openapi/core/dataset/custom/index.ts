import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { SearchApiBodySchema, SearchApiResponseSchema } from '../api';

export const CustomPath: OpenAPIPath = {
  '/core/dataset/custom/searchApi': {
    post: {
      summary: '多知识库检索',
      description: '跨知识库检索，支持混合召回、重排序、LLM 问题扩展和 Agentic 深度检索',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: SearchApiBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回检索结果列表、耗时及使用的策略信息',
          content: {
            'application/json': { schema: SearchApiResponseSchema }
          }
        }
      }
    }
  }
};
