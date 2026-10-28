import { IntSchema } from '../../../common/zod';
import { z } from 'zod';

export const WorkflowChecksumSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .meta({
    description: 'WorkflowDocument 的 SHA-256 checksum',
    example: `sha256:${'0'.repeat(64)}`
  });

/** AI 完成 Workflow Builder 生成后写入 ChatItem 的版本文件信息。 */
export const WorkflowBuilderVersionSchema = z
  .object({
    versionNo: IntSchema.positive().meta({
      description: '当前工作流辅助生成会话中的 AI 生成版本序号',
      example: 1
    }),
    name: z.string().min(1).meta({
      description: '版本展示名称',
      example: 'AI 生成版本 1'
    }),
    filename: z.string().min(1).meta({
      description: '版本 JSON 文件名',
      example: 'AI 生成版本 1.json'
    }),
    checksum: WorkflowChecksumSchema,
    generatedAt: z.string().datetime().meta({
      description: 'AI 完成生成的时间',
      example: '2026-08-12T10:00:00.000Z'
    }),
    s3Key: z.string().min(1).optional().meta({
      description: '生成校验成功后归档到聊天文件 S3 的对象 key'
    }),
    expiresAt: z.string().datetime().optional().meta({
      description: 'S3 版本过期时间',
      example: '2026-08-13T10:00:00.000Z'
    }),
    appliedAt: z.string().datetime().optional().meta({
      description: '版本首次成功应用到画布的时间',
      example: '2026-08-12T10:00:00.000Z'
    })
  })
  .strict();

export type WorkflowBuilderVersion = z.infer<typeof WorkflowBuilderVersionSchema>;

export type WorkflowBuilderVersionDisplayState = 'ready' | 'available' | 'expired';

export const WorkflowBuilderPreviewActionSchema = z.enum(['confirm', 'revise', 'cancel']);
export type WorkflowBuilderPreviewAction = z.infer<typeof WorkflowBuilderPreviewActionSchema>;

/** Preview 回复按 action 区分：仅 revise 必须携带非空修改意见，其余动作不接受该字段。 */
export const WorkflowBuilderPreviewReplySchema = z.discriminatedUnion('action', [
  z
    .object({
      type: z.literal('workflowBuilderPreview'),
      action: z.literal('confirm').meta({ description: '确认方案并开始搭建' })
    })
    .strict(),
  z
    .object({
      type: z.literal('workflowBuilderPreview'),
      action: z.literal('cancel').meta({ description: '取消本次搭建' })
    })
    .strict(),
  z
    .object({
      type: z.literal('workflowBuilderPreview'),
      action: z.literal('revise').meta({ description: '修改方案' }),
      reviseText: z.string().trim().min(1).meta({ description: '修改方案的具体意见，不能为空' })
    })
    .strict()
]);
export type WorkflowBuilderPreviewReply = z.infer<typeof WorkflowBuilderPreviewReplySchema>;

export const WorkflowBuilderPreviewSectionSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1)
});
export type WorkflowBuilderPreviewSection = z.infer<typeof WorkflowBuilderPreviewSectionSchema>;

/** Preview 展示与服务端校验共用的工具参数，解析结果不重复持久化。 */
export const WorkflowBuilderPreviewPayloadSchema = z.object({
  title: z.string().trim().min(1),
  mermaid: z.string().trim().min(1),
  sections: z.array(WorkflowBuilderPreviewSectionSchema).min(1)
});
export type WorkflowBuilderPreviewPayload = z.infer<typeof WorkflowBuilderPreviewPayloadSchema>;

/** 严格解析原始 JSON；拒绝自动修复，确保客户端可以解析同一份原文。 */
export const WorkflowBuilderPreviewArgumentsSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Preview tool arguments are not valid JSON.' });
      return z.NEVER;
    }
  })
  .pipe(WorkflowBuilderPreviewPayloadSchema);

/**
 * 仅保存模型原始参数字符串；展示时解析，恢复 tool call 时原样使用。
 * 固定操作由前端提供，回答独立保存到下一条 Human。
 */
export const WorkflowBuilderPreviewInteractiveSchema = z.object({
  type: z.literal('workflowBuilderPreview'),
  previewId: z.string().min(1),
  params: z.object({
    arguments: z
      .string()
      .refine((value) => WorkflowBuilderPreviewArgumentsSchema.safeParse(value).success, {
        message: 'Invalid Preview tool arguments'
      })
      .meta({ description: '模型原始 Preview 工具参数 JSON 字符串，展示时解析，恢复时原样使用' })
  })
});
export type WorkflowBuilderPreviewInteractive = z.infer<
  typeof WorkflowBuilderPreviewInteractiveSchema
>;

/** 由预览后紧邻的 Human 消息解析，仅用于本轮执行和模型工具上下文，不写回预览。 */
export type WorkflowBuilderPreviewDecision = {
  previewId: string;
  action: WorkflowBuilderPreviewAction;
  feedback?: string;
};

/** Builder 只持久化业务执行事实；对话、计划和模型暂停状态沿用 ChatItem 协议。 */
export const WorkflowBuilderTaskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().min(1),
  requestChatItemId: z.string().min(1),
  baseChecksum: WorkflowChecksumSchema,
  preview: z.object({
    previewId: z.string().min(1),
    responseChatItemId: z.string().min(1),
    checksum: WorkflowChecksumSchema
  }),
  cancelled: z.boolean().optional(),
  delivery: z
    .object({
      operationId: z.string().min(1),
      draftRevision: z.string().min(1),
      targetChecksum: WorkflowChecksumSchema,
      responseChatItemId: z.string().min(1),
      version: WorkflowBuilderVersionSchema.optional()
    })
    .optional()
});
export type WorkflowBuilderTask = z.infer<typeof WorkflowBuilderTaskSchema>;
