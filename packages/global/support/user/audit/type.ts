import type { SourceMemberType } from '../type';
import type { TeamAuditEvent } from './constants';
import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { AppTypeEnum } from '../../../core/app/constants';

// 其他资源字段显式为 never，避免跨分支混用 ID 和应用类型。
const excludedResourceFields = {
  appId: z.never().optional(),
  appType: z.never().optional(),
  datasetId: z.never().optional(),
  skillId: z.never().optional(),
  collectionId: z.never().optional()
};

/** 每个审计关联项恰好标识一个业务资源；多个资源通过数组分别记录。 */
export const AuditResourceSchema = z.union([
  z.strictObject({
    ...excludedResourceFields,
    appId: ObjectIdSchema.meta({ description: '关联应用或工具 ID' }),
    appType: z.enum(AppTypeEnum).optional().meta({
      description: '操作时的应用类型，用于区分应用与工具；历史日志可省略',
      example: AppTypeEnum.workflowTool
    })
  }),
  z.strictObject({
    ...excludedResourceFields,
    datasetId: ObjectIdSchema.meta({ description: '关联知识库 ID' })
  }),
  z.strictObject({
    ...excludedResourceFields,
    skillId: ObjectIdSchema.meta({ description: '关联技能 ID' })
  }),
  z.strictObject({
    ...excludedResourceFields,
    collectionId: ObjectIdSchema.meta({ description: '关联集合 ID' })
  })
]);
export type AuditResourceType = z.infer<typeof AuditResourceSchema>;
export const AuditResourcesSchema = z.array(AuditResourceSchema);

export type TeamAuditSchemaType = {
  _id: string;
  teamId: string;
  timestamp: Date;
  event: TeamAuditEvent;
  resources?: AuditResourceType[];
  metadata?: Record<string, string>;
} & (
  | {
      tmbId: string;
      scope?: 'member';
    }
  | {
      tmbId?: never;
      scope: 'system';
    }
);
export type TeamAuditListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: TeamAuditEvent;
  timestamp: Date;
  resources?: AuditResourceType[];
  metadata: Record<string, string>;
};
