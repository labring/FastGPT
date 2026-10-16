import { z } from 'zod';
import type { SourceMemberType } from '../type';
import type { AuditEventEnum } from './constants';

export type TeamAuditScope = 'member' | 'system';

export const TeamAuditDetailSchema = z
  .object({
    resourceId: z.string().optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '被操作资源 ID'
    }),
    resourceName: z.string().meta({
      example: '产品文档',
      description: '被操作资源名称'
    }),
    resourceType: z.string().optional().meta({
      example: 'collection',
      description: '资源类型'
    }),
    sourceType: z.string().optional().meta({
      example: 'link',
      description: '资源来源类型'
    }),
    sourceName: z.string().optional().meta({
      example: '产品文档',
      description: '资源来源名称'
    }),
    action: z.string().meta({
      example: 'import',
      description: '对资源执行的动作'
    }),
    result: z.string().meta({
      example: 'processing',
      description: '处理结果'
    }),
    failureReason: z.string().optional().meta({
      example: 'embedding failed',
      description: '失败原因'
    }),
    processingParams: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .meta({
        example: { trainingType: 'chunk', chunkSize: 1024, indexSize: 512 },
        description: '处理参数'
      })
  })
  .meta({ description: '审计事件的单项处理明细' });
export type TeamAuditDetail = z.infer<typeof TeamAuditDetailSchema>;
export type TeamAuditMetadataValue = string | number | boolean | string[] | TeamAuditDetail[];

export type TeamAuditSchemaType = {
  _id: string;
  tmbId?: string;
  teamId: string;
  timestamp: Date;
  event: `${AuditEventEnum}`;
  scope?: TeamAuditScope;
  metadata?: Record<string, TeamAuditMetadataValue>;
};
export type TeamAuditListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: `${AuditEventEnum}`;
  scope?: TeamAuditScope;
  timestamp: Date;
  metadata: Record<string, TeamAuditMetadataValue>;
};
