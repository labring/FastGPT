import { z } from 'zod';
import type { SourceMemberType } from '../type';
import type { AuditEventEnum } from './constants';

export type TeamAuditScope = 'member' | 'system';

export const TeamAuditDetailSchema = z.object({
  resourceId: z.string().optional(),
  resourceName: z.string(),
  resourceType: z.string().optional(),
  sourceType: z.string().optional(),
  sourceName: z.string().optional(),
  action: z.string(),
  result: z.string(),
  failureReason: z.string().optional(),
  processingParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});
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
