import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetSandboxPackagesQuerySchema,
  GetSandboxPackagesResponseSchema,
  OptimizeCodeBodySchema,
  OptimizeCodeResponseSchema,
  WorkflowDebugBodySchema,
  WorkflowDebugResponseSchema
} from './api';

export const WorkflowPath: OpenAPIPath = {
  '/core/workflow/debug': {
    post: {
      summary: '调试工作流',
      description: '从指定节点开始调试应用工作流，返回本轮节点状态、响应和变量',
      tags: [DevApiTagsMap.workflowDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: WorkflowDebugBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回工作流调试结果',
          content: {
            'application/json': {
              schema: WorkflowDebugResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/workflow/getSandboxPackages': {
    get: {
      summary: '获取代码沙盒可用依赖',
      description: '获取代码节点沙盒支持的 JavaScript、Python 依赖和内置全局变量',
      tags: [DevApiTagsMap.appOther],
      requestParams: {
        query: GetSandboxPackagesQuerySchema
      },
      responses: {
        200: {
          description: '成功返回代码沙盒可用依赖',
          content: {
            'application/json': {
              schema: GetSandboxPackagesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/workflow/optimizeCode': {
    post: {
      summary: '生成或优化代码节点代码',
      description: '根据用户要求和历史对话调用指定模型，以 SSE 流式生成代码节点代码',
      tags: [DevApiTagsMap.workflowHelper],
      requestBody: {
        content: {
          'application/json': {
            schema: OptimizeCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回代码节点生成结果事件流',
          content: {
            'text/event-stream': {
              schema: OptimizeCodeResponseSchema
            }
          }
        }
      }
    }
  }
};
