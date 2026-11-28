import { DevApiTagsMap } from '../../../tag';
import type { OpenAPIPath } from '../../../type';
import {
  AdminDatasetTrainingEnhanceBodySchema,
  AdminDatasetTrainingEnhanceResponseSchema,
  AdminLlmParagraphBodySchema,
  AdminLlmParagraphResponseSchema
} from './api';

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
  },
  '/core/dataset/training/enhance': {
    post: {
      summary: '计算知识库分块增强结果',
      description:
        '供 FastGPT App 的文档训练 Worker 调用，返回新增草稿与描述，并在 Pro 内直接登记模型用量。',
      tags: [DevApiTagsMap.subserviceProDataset],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: AdminDatasetTrainingEnhanceBodySchema }
        }
      },
      responses: {
        200: {
          description: '计算完成或跳过该增强阶段',
          content: {
            'application/json': { schema: AdminDatasetTrainingEnhanceResponseSchema }
          }
        }
      }
    }
  }
};
