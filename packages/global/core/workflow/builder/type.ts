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
      description: '当前 Workflow Builder 会话中的 AI 生成版本序号',
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
      description: '应用成功后归档到聊天文件 S3 的对象 key'
    }),
    expiresAt: z.string().datetime().optional().meta({
      description: 'S3 版本过期时间',
      example: '2026-08-13T10:00:00.000Z'
    }),
    appliedAt: z.string().datetime().optional().meta({
      description: '版本首次成功应用并归档的时间',
      example: '2026-08-12T10:00:00.000Z'
    })
  })
  .strict();

export type WorkflowBuilderVersion = z.infer<typeof WorkflowBuilderVersionSchema>;

export type WorkflowBuilderVersionDisplayState = 'ready' | 'available' | 'expired' | 'superseded';
