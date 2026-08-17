import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  WorkflowBuilderChatBodySchema,
  WorkflowBuilderVersionCommitBodySchema,
  WorkflowBuilderVersionCommitResponseSchema,
  WorkflowBuilderVersionLoadBodySchema,
  WorkflowBuilderVersionLoadResponseSchema,
  WorkflowBuilderRuntimePrewarmBodySchema,
  WorkflowBuilderRuntimePrewarmResponseSchema
} from './api';

export const WorkflowBuilderPath: OpenAPIPath = {
  '/core/workflow/builder/chat': {
    post: {
      summary: 'Workflow Builder 辅助生成对话',
      description:
        '基于当前 WorkflowDocument 运行 Agent + CLI，生成经服务端验证、等待用户确认应用的目标版本。',
      tags: [DevApiTagsMap.workflowBuilder],
      requestBody: {
        content: {
          'application/json': {
            schema: WorkflowBuilderChatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream Workflow Builder 事件流',
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
      summary: '加载 Workflow Builder 版本',
      description: '从 Sandbox 或 S3 加载聊天版本卡片绑定的 WorkflowDocument。',
      tags: [DevApiTagsMap.workflowBuilder],
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
      summary: '归档 Workflow Builder 版本',
      description: '画布应用成功后，将实际应用的 WorkflowDocument 归档到 S3 一天。',
      tags: [DevApiTagsMap.workflowBuilder],
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
  },
  '/core/workflow/builder/runtime/prewarm': {
    post: {
      summary: '预热 Workflow Builder 运行环境',
      description:
        '在用户打开 Workflow Builder 后提前准备可复用的 Sandbox、内置 Skill 和 Workflow CLI。',
      tags: [DevApiTagsMap.workflowBuilder],
      requestBody: {
        content: { 'application/json': { schema: WorkflowBuilderRuntimePrewarmBodySchema } }
      },
      responses: {
        200: {
          description: '运行环境预热完成',
          content: { 'application/json': { schema: WorkflowBuilderRuntimePrewarmResponseSchema } }
        }
      }
    }
  }
};
