import z from 'zod';
import { ChatCompletionMessageParamSchema } from '../../../core/ai/llm/type';
import { ObjectIdSchema } from '../../../common/type/mongo';
import {
  ChatItemMiniSchema,
  UserChatItemValueItemSchema,
  type ChatHistoryItemResType
} from '../../../core/chat/type';
import { AppChatConfigInputSchema } from '../app/common/api';
import { RuntimeEdgeItemTypeSchema } from '../../../core/workflow/type/edge';
import type { RuntimeNodeItemType } from '../../../core/workflow/runtime/type';
import type { InteractiveNodeResponseType } from '../../../core/workflow/template/system/interactive/type';

/* ============================================================================
 * API: 调试工作流
 * Route: POST /api/core/workflow/debug
 * Method: POST
 * Description: 从指定节点开始调试应用工作流，返回本轮节点状态、响应和变量
 * Tags: ['工作流调试', 'Write']
 * ============================================================================ */

const WorkflowDebugSkipNodeQueueItemSchema = z.object({
  id: z.string().meta({
    example: 'skip-queue-1',
    description: '跳过队列记录 ID'
  }),
  skippedNodeIdList: z.array(z.string()).meta({
    example: ['node-2'],
    description: '已跳过的节点 ID 列表'
  })
});

// 调试状态可能携带前端连线的扩展字段，基础字段按业务 Schema 校验并保留其余字段。
const WorkflowDebugRuntimeEdgeSchema = RuntimeEdgeItemTypeSchema.catchall(z.any());

// 运行时节点和响应包含插件、自定义节点扩展。保留旧接口类型，但不在 API 边界误拦截动态字段。
const DynamicObjectOpenApiMeta = {
  override: {
    type: 'object' as const,
    additionalProperties: true
  }
};
const WorkflowDebugRuntimeNodeSchema = z
  .custom<RuntimeNodeItemType>()
  .meta(DynamicObjectOpenApiMeta);
const WorkflowDebugNodeResponseDataSchema = z
  .custom<ChatHistoryItemResType>()
  .meta(DynamicObjectOpenApiMeta);
const WorkflowDebugInteractiveResponseSchema = z
  .custom<InteractiveNodeResponseType>()
  .meta(DynamicObjectOpenApiMeta);

export const WorkflowDebugBodySchema = z.object({
  nodes: z.array(WorkflowDebugRuntimeNodeSchema).default([]).meta({
    description: '待调试的运行时节点列表'
  }),
  edges: z.array(WorkflowDebugRuntimeEdgeSchema).default([]).meta({
    description: '待调试的运行时连线列表'
  }),
  skipNodeQueue: z.array(WorkflowDebugSkipNodeQueueItemSchema).optional().meta({
    description: '跨轮调试时需要保留的节点跳过状态'
  }),
  variables: z
    .record(z.string(), z.any())
    .default({})
    .meta({
      example: { appId: '68ad85a7463006c963799a05', locale: 'zh-CN' },
      description: '本轮工作流使用的全局变量'
    }),
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '待调试的应用 ID'
  }),
  query: z.array(UserChatItemValueItemSchema).default([]).meta({
    description: '本轮调试的用户输入内容'
  }),
  history: z.array(ChatItemMiniSchema).default([]).meta({
    description: '调试所需的历史对话消息'
  }),
  chatConfig: AppChatConfigInputSchema.optional().meta({
    description: '覆盖应用默认值的临时对话配置'
  }),
  usageId: z.string().optional().meta({
    example: 'usage_debug_123',
    description: '连续调试复用的用量记录 ID；不传时自动创建'
  }),
  chatId: z.string().min(1).optional().meta({
    example: 'debug-session-chat-id',
    description: '调试会话内文件上传使用的 chatId；调试运行会沿用该值，保证上传文件归属校验通过'
  })
});
export type WorkflowDebugBody = z.input<typeof WorkflowDebugBodySchema>;

const WorkflowDebugNodeResponseSchema = z.object({
  nodeId: z.string().meta({
    example: 'node-1',
    description: '节点 ID'
  }),
  type: z.enum(['skip', 'run']).meta({
    example: 'run',
    description: '节点本轮是执行还是跳过'
  }),
  response: WorkflowDebugNodeResponseDataSchema.optional().meta({
    description: '节点执行响应；结构随节点类型变化'
  }),
  interactiveResponse: WorkflowDebugInteractiveResponseSchema.optional().meta({
    description: '节点需要继续交互时返回的交互信息'
  })
});

export const WorkflowDebugResponseSchema = z.object({
  memoryEdges: z.array(WorkflowDebugRuntimeEdgeSchema).meta({
    description: '本轮执行完成后的运行时连线状态'
  }),
  memoryNodes: z.array(WorkflowDebugRuntimeNodeSchema).meta({
    description: '本轮执行完成后的运行时节点状态'
  }),
  entryNodeIds: z.array(z.string()).meta({
    example: ['node-2'],
    description: '下一轮可继续执行的入口节点 ID'
  }),
  nodeResponses: z.record(z.string(), WorkflowDebugNodeResponseSchema).meta({
    description: '按节点 ID 聚合的本轮调试响应'
  }),
  skipNodeQueue: z.array(WorkflowDebugSkipNodeQueueItemSchema).optional().meta({
    description: '下一轮调试需要携带的节点跳过状态'
  }),
  newVariables: z.record(z.string(), z.any()).meta({
    example: { result: 'success' },
    description: '工作流执行后更新的全局变量'
  }),
  usageId: z.string().meta({
    example: 'usage_debug_123',
    description: '本次调试对应的用量记录 ID'
  })
});
export type WorkflowDebugResponse = z.infer<typeof WorkflowDebugResponseSchema>;

/* ============================================================================
 * API: 生成或优化代码节点代码
 * Route: POST /api/core/workflow/optimizeCode
 * Method: POST
 * Description: 根据用户要求和对话历史调用指定模型，以 SSE 流式生成代码节点代码
 * Tags: ['工作流辅助生成', 'Write']
 * ============================================================================ */

export const OptimizeCodeBodySchema = z.object({
  optimizerInput: z.string().meta({
    example: '编写一个 JavaScript 函数，将输入数组去重后按升序返回。',
    description: '代码节点的生成或优化要求'
  }),
  modelId: z.string().meta({
    description: '执行代码生成的模型 ID'
  }),
  conversationHistory: z.array(ChatCompletionMessageParamSchema).optional().meta({
    description: '代码节点 Copilot 的历史对话消息，不传时按空数组处理'
  })
});
export type OptimizeCodeBody = z.infer<typeof OptimizeCodeBodySchema>;

export const OptimizeCodeResponseSchema = z.string().meta({
  example: 'event: answer\ndata: {"choices":[{"delta":{"content":"```javascript"}}]}\n\n',
  description: 'SSE 事件流；answer 事件采用 OpenAI delta 格式，最后一个事件的数据为 [DONE]'
});
export type OptimizeCodeResponse = z.infer<typeof OptimizeCodeResponseSchema>;

/* ============================================================================
 * API: 获取代码沙盒可用依赖
 * Route: GET /api/core/workflow/getSandboxPackages
 * Method: GET
 * Description: 获取代码节点沙盒支持的 JavaScript、Python 依赖和内置全局变量
 * Tags: ['其他', 'Read']
 * ============================================================================ */

export const GetSandboxPackagesQuerySchema = z.object({}).meta({
  description: '该接口不需要查询参数'
});
export type GetSandboxPackagesQuery = z.infer<typeof GetSandboxPackagesQuerySchema>;

export const GetSandboxPackagesResponseSchema = z.object({
  js: z.array(z.string()).meta({
    example: ['lodash', 'dayjs'],
    description: 'JavaScript 沙盒可用依赖包列表'
  }),
  python: z.array(z.string()).meta({
    example: ['numpy', 'pandas'],
    description: 'Python 沙盒可用依赖包列表'
  }),
  builtinGlobals: z.array(z.string()).meta({
    example: ['Buffer', 'URL'],
    description: 'JavaScript 沙盒可直接使用的内置全局变量列表'
  })
});
export type GetSandboxPackagesResponse = z.infer<typeof GetSandboxPackagesResponseSchema>;
