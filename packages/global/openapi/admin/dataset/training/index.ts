import { DevApiTagsMap } from '../../../tag';
import type { OpenAPIPath } from '../../../type';
import { AdminLlmParagraphBodySchema, AdminLlmParagraphResponseSchema } from './api';

export const AdminDatasetTrainingPath: OpenAPIPath = {
  '/core/dataset/training/llmPargraph': {
    post: {
      summary: '使用 LLM 为长文本补充段落标题',
      description: '仅供 FastGPT 内部调用。供 App 知识库解析队列调用的 Pro Admin 服务接口',
      tags: [DevApiTagsMap.subserviceProDataset],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminLlmParagraphBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '段落标题补充完成',
          content: {
            'application/json': {
              schema: AdminLlmParagraphResponseSchema
            }
          }
        }
      }
    }
  }
};
