import type { SourceMemberType } from '../type';
import type { TeamAuditEvent } from './constants';
import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

// 其他 ID 显式为 never，防止 TypeScript 的普通对象 union 接受同时包含多个分支字段的对象。
const excludedResourceIds = {
  appId: z.never().optional(),
  datasetId: z.never().optional(),
  skillId: z.never().optional(),
  collectionId: z.never().optional()
};

/** 每个审计关联项恰好标识一个业务资源；多个资源通过数组分别记录。 */
export const AuditResourceSchema = z.union([
  z.strictObject({
    ...excludedResourceIds,
    appId: ObjectIdSchema.meta({ description: '关联应用 ID' })
  }),
  z.strictObject({
    ...excludedResourceIds,
    datasetId: ObjectIdSchema.meta({ description: '关联知识库 ID' })
  }),
  z.strictObject({
    ...excludedResourceIds,
    skillId: ObjectIdSchema.meta({ description: '关联技能 ID' })
  }),
  z.strictObject({
    ...excludedResourceIds,
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
  metadata: Record<string, string>;
};
