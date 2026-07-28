import { z } from 'zod';
import { AppChatConfigTypeSchema } from '../../../../core/app/type';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { StoreNodeItemTypeSchema } from '../../../../core/workflow/type/node';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * API: Workflow Builder 辅助生成对话
 * Route: POST /api/proApi/core/workflow/builder/chat
 * Method: POST
 * Description: 基于当前 WorkflowDocument 生成并自动应用工作流，通过 SSE 返回目标文档
 * Tags: ['Workflow Builder']
 * ============================================================================ */

const WorkflowChecksumSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .meta({
    description: 'WorkflowDocument 的 SHA-256 checksum',
    example: `sha256:${'0'.repeat(64)}`
  });

const ExecutionSourcePortRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('next'), nodeId: z.string().min(1) }),
  z.object({
    kind: z.literal('branch'),
    nodeId: z.string().min(1),
    branchKey: z.string().min(1)
  }),
  z.object({
    kind: z.literal('sourceOutput'),
    nodeId: z.string().min(1),
    outputKey: z.string().min(1)
  }),
  z.object({ kind: z.literal('catch'), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal('selectedTools'), nodeId: z.string().min(1) })
]);

const ExecutionTargetPortRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('target'), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal('selectedTools'), nodeId: z.string().min(1) })
]);

/**
 * Workflow Builder 请求的传输层 Document Schema。
 *
 * Handler 还会用 workflow-core 再次执行版本和领域校验；这里只负责 API
 * 边界的完整结构约束，避免 global package 反向依赖 workflow-core。
 */
export const WorkflowBuilderDocumentSchema = z
  .object({
    schemaVersion: z.literal('fastgpt-workflow/v1').meta({
      description: 'WorkflowDocument schema 版本',
      example: 'fastgpt-workflow/v1'
    }),
    app: z
      .object({
        appId: z.string().optional(),
        name: z.string().optional(),
        intro: z.string().optional(),
        appType: z.string().optional(),
        baseVersionId: z.string().optional()
      })
      .meta({ description: '应用元数据' }),
    nodes: z.array(StoreNodeItemTypeSchema).meta({ description: '工作流节点' }),
    executionEdges: z
      .array(
        z.object({
          source: ExecutionSourcePortRefSchema,
          target: ExecutionTargetPortRefSchema
        })
      )
      .meta({ description: '语义执行边' }),
    chatConfig: AppChatConfigTypeSchema.meta({ description: '工作流对话配置' })
  })
  .strict();

export const WorkflowBuilderChatBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      description: '当前 Workflow 应用 ID',
      example: '67f4c91c79a4d61b1f116b2a'
    }),
    chatId: z.string().min(1).meta({
      description: 'Workflow Builder 独立会话 ID',
      example: 'workflow-builder-chat-id'
    }),
    responseChatItemId: z.string().min(1).optional().meta({
      description: '当前轮 AI 消息 ID',
      example: 'response-chat-item-id'
    }),
    messages: z.array(ChatCompletionMessageParamSchema).min(1).meta({
      description: '当前轮 ChatBox 消息'
    }),
    model: z.string().min(1).optional().meta({
      description: 'Workflow Builder 使用的 LLM 模型',
      example: 'gpt-5'
    }),
    workflowContext: z
      .object({
        document: WorkflowBuilderDocumentSchema,
        checksum: WorkflowChecksumSchema
      })
      .strict()
      .meta({ description: '当前画布事实和对应 checksum' })
  })
  .strict();

export type WorkflowBuilderChatBody = z.infer<typeof WorkflowBuilderChatBodySchema>;

/** CLI Apply 完成后通过 SSE 返回给画布的目标文档。 */
export const WorkflowBuilderAppliedSchema = z
  .object({
    document: WorkflowBuilderDocumentSchema.meta({
      description: 'CLI Apply 后经服务端校验的目标 WorkflowDocument'
    }),
    checksum: WorkflowChecksumSchema.meta({ description: '目标 WorkflowDocument checksum' })
  })
  .strict();

export type WorkflowBuilderApplied = z.infer<typeof WorkflowBuilderAppliedSchema>;
