import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { WorkflowBuilderChatBodySchema } from './api';

export const WorkflowBuilderPath: OpenAPIPath = {
  '/core/workflow/builder/chat': {
    post: {
      summary: 'Workflow Builder 辅助生成对话',
      description:
        '基于当前 WorkflowDocument 运行 Agent + CLI，自动应用经服务端验证的变更，并通过 SSE 返回目标文档。',
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
  }
};
