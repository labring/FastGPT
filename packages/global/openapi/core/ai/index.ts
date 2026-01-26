import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import { GetLLMRequestRecordParamsSchema, LLMRequestRecordResponseSchema } from './api';

export const AIPath: OpenAPIPath = {
  '/core/ai/record/getRecord': {
    get: {
      summary: '获取 LLM 请求追踪记录',
      description: '根据 requestId 查询 LLM 请求的详细信息,包括请求体和响应内容',
      tags: [TagsMap.ai],
      parameters: [
        {
          name: 'requestId',
          in: 'query',
          required: true,
          schema: GetLLMRequestRecordParamsSchema.shape.requestId
        }
      ],
      responses: {
        200: {
          description: '成功返回 LLM 请求记录',
          content: {
            'application/json': {
              schema: LLMRequestRecordResponseSchema
            }
          }
        }
      }
    }
  }
};
