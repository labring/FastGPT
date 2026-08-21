import { z } from 'zod';
import { AppChatConfigTypeSchema } from '../../../../core/app/type';
import { ChatCompletionMessageParamSchema } from '../../../../core/ai/llm/type';
import { StoreNodeItemTypeSchema } from '../../../../core/workflow/type/node';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { AgentPlanAskResponseSchema } from '../../../../core/workflow/template/system/interactive/type';
import { OpenAPIAppChatConfigSchema } from '../../app/common/api';
import {
  WorkflowBuilderVersionSchema,
  WorkflowChecksumSchema
} from '../../../../core/workflow/builder/type';
import { OpenAPIStoreNodeItemTypeSchema } from '../node';

/* ============================================================================
 * API: Workflow Builder 辅助生成对话
 * Route: POST /api/proApi/core/workflow/builder/chat
 * Method: POST
 * Description: 基于当前 WorkflowDocument 生成并自动应用工作流，通过 SSE 返回目标文档
 * Tags: ['Workflow Builder']
 * ============================================================================ */

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
    agentPlanAskResponse: AgentPlanAskResponseSchema.optional().meta({
      description: '用户对当前 Agent 结构化选项的回答'
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
    baseChecksum: WorkflowChecksumSchema.meta({
      description: '生成开始时的 WorkflowDocument checksum，用于应用前的乐观并发校验'
    }),
    document: WorkflowBuilderDocumentSchema.meta({
      description: 'CLI Apply 后经服务端校验的目标 WorkflowDocument'
    }),
    checksum: WorkflowChecksumSchema.meta({ description: '目标 WorkflowDocument checksum' })
  })
  .strict();

export type WorkflowBuilderApplied = z.infer<typeof WorkflowBuilderAppliedSchema>;

const WorkflowBuilderVersionIdentitySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      description: 'Workflow 应用 ID',
      example: '67f4c91c79a4d61b1f116b2a'
    }),
    chatId: z.string().min(1).meta({
      description: 'Workflow Builder 会话 ID',
      example: 'workflow-builder-chat-id'
    }),
    responseChatItemId: z.string().min(1).meta({
      description: '包含目标版本的 AI ChatItem dataId',
      example: 'response-chat-item-id'
    })
  })
  .strict();

/* ============================================================================
 * API: 加载 Workflow Builder 版本
 * Route: POST /api/proApi/core/workflow/builder/version/load
 * Method: POST
 * Description: 从 S3 加载聊天卡片绑定的 WorkflowDocument；旧消息保留 Sandbox 兼容
 * Tags: ['Workflow Builder']
 * ============================================================================ */

export const WorkflowBuilderVersionLoadBodySchema = WorkflowBuilderVersionIdentitySchema;
export type WorkflowBuilderVersionLoadBody = z.infer<typeof WorkflowBuilderVersionLoadBodySchema>;

// OpenAPI 输出不能包含节点旧枚举兼容用的 transform；运行时请求仍使用完整 Document Schema。
const WorkflowBuilderVersionDocumentResponseSchema = WorkflowBuilderDocumentSchema.omit({
  nodes: true,
  chatConfig: true
}).extend({
  nodes: z.array(OpenAPIStoreNodeItemTypeSchema).meta({ description: '工作流节点' }),
  chatConfig: OpenAPIAppChatConfigSchema.meta({ description: '工作流对话配置' })
});

export const WorkflowBuilderVersionLoadResponseSchema = z
  .object({
    versionNo: WorkflowBuilderVersionSchema.shape.versionNo,
    document: WorkflowBuilderVersionDocumentResponseSchema,
    checksum: WorkflowChecksumSchema,
    source: z.enum(['sandbox', 's3']).meta({
      description: '版本 JSON 的读取来源',
      example: 'sandbox'
    })
  })
  .strict();
export type WorkflowBuilderVersionLoadResponse = z.infer<
  typeof WorkflowBuilderVersionLoadResponseSchema
>;

/* ============================================================================
 * API: 确认 Workflow Builder 版本已应用
 * Route: POST /api/proApi/core/workflow/builder/version/commit
 * Method: POST
 * Description: 画布应用成功后幂等记录首次应用时间
 * Tags: ['Workflow Builder']
 * ============================================================================ */

export const WorkflowBuilderVersionCommitBodySchema = WorkflowBuilderVersionIdentitySchema.extend({
  document: WorkflowBuilderDocumentSchema,
  checksum: WorkflowChecksumSchema
}).strict();
export type WorkflowBuilderVersionCommitBody = z.infer<
  typeof WorkflowBuilderVersionCommitBodySchema
>;

export const WorkflowBuilderVersionCommitResponseSchema = WorkflowBuilderVersionSchema.required({
  s3Key: true,
  expiresAt: true,
  appliedAt: true
});
export type WorkflowBuilderVersionCommitResponse = z.infer<
  typeof WorkflowBuilderVersionCommitResponseSchema
>;

/* ============================================================================
 * API: Workflow Builder 运行环境预热
 * Route: POST /api/proApi/core/workflow/builder/runtime/prewarm
 * Method: POST
 * Description: 在打开 Workflow Builder 后提前准备可复用的 Sandbox 运行环境
 * Tags: ['Workflow Builder']
 * ============================================================================ */

export const WorkflowBuilderRuntimePrewarmBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      description: '当前 Workflow 应用 ID',
      example: '67f4c91c79a4d61b1f116b2a'
    }),
    chatId: z.string().min(1).meta({
      description: 'Workflow Builder 独立会话 ID',
      example: 'workflow-builder-chat-id'
    })
  })
  .strict();
export type WorkflowBuilderRuntimePrewarmBody = z.infer<
  typeof WorkflowBuilderRuntimePrewarmBodySchema
>;

export const WorkflowBuilderRuntimePrewarmResponseSchema = z.undefined().meta({
  description: '运行环境预热完成'
});
export type WorkflowBuilderRuntimePrewarmResponse = z.infer<
  typeof WorkflowBuilderRuntimePrewarmResponseSchema
>;
