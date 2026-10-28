import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  WorkflowBuilderChatBodySchema,
  WorkflowBuilderVersionCommitBodySchema,
  WorkflowBuilderVersionCommitResponseSchema,
  WorkflowBuilderVersionLoadBodySchema,
  WorkflowBuilderVersionLoadResponseSchema
} from './api';

export const WorkflowBuilderPath: OpenAPIPath = {
  '/core/workflow/builder/chat': {
    post: {
      summary: '发起工作流辅助生成对话',
      description:
        '基于当前 WorkflowDocument 运行 Agent + CLI，生成经服务端验证、等待用户确认应用的目标版本。',
      tags: [DevApiTagsMap.workflowHelper],
      requestBody: {
        content: {
          'application/json': {
            schema: WorkflowBuilderChatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 工作流辅助生成事件流',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string'
              }
            }
          }
        }
      }
    }
  },
  '/core/workflow/builder/version/load': {
    post: {
      summary: '加载工作流辅助生成版本',
      description: '从 Sandbox 或 S3 加载聊天版本卡片绑定的 WorkflowDocument。',
      tags: [DevApiTagsMap.workflowHelper],
      requestBody: {
        content: { 'application/json': { schema: WorkflowBuilderVersionLoadBodySchema } }
      },
      responses: {
        200: {
          description: '版本文档',
          content: { 'application/json': { schema: WorkflowBuilderVersionLoadResponseSchema } }
        }
      }
    }
  },
  '/core/workflow/builder/version/commit': {
    post: {
      summary: '记录首次本地画布应用确认',
      description:
        '记录用户首次在本地画布应用该版本的确认事实；候选文档归档已在生成完成时存入 S3。',
      tags: [DevApiTagsMap.workflowHelper],
      requestBody: {
        content: { 'application/json': { schema: WorkflowBuilderVersionCommitBodySchema } }
      },
      responses: {
        200: {
          description: '归档后的版本信息',
          content: { 'application/json': { schema: WorkflowBuilderVersionCommitResponseSchema } }
        }
      }
    }
  }
};
