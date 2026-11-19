import { defineIndex, Schema, getMongoLogModel } from '../../../common/mongo';
import {
  AuditResourcesSchema,
  AuditResourceTypeEnum,
  type AuditResourceType,
  type TeamAuditSchemaType
} from '@fastgpt/global/support/user/audit/type';
import type { Types } from 'mongoose';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  AdminAuditEventEnum,
  TeamAuditEventList
} from '@fastgpt/global/support/user/audit/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const TeamAuditCollectionName = 'operationLogs';

const TeamAuditSchema = new Schema({
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: function (this: { scope?: 'member' | 'system' }) {
      return this.scope !== 'system';
    }
  },
  scope: {
    type: String,
    enum: ['member', 'system']
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  timestamp: {
    type: Date,
    default: () => new Date()
  },
  event: {
    type: String,
    enum: [...TeamAuditEventList, ...Object.values(AdminAuditEventEnum)],
    required: true
  },
  // 保存受操作实体类型、ID、名称/头像快照及父级上下文；资源删除后仍可展示且导出无需回查业务库。
  resources: {
    type: [
      new Schema(
        {
          type: {
            type: String,
            enum: Object.values(AuditResourceTypeEnum),
            required: true
          },
          id: String,
          name: String,
          avatar: String,
          datasetId: Schema.Types.ObjectId,
          parentId: Schema.Types.ObjectId,
          collectionType: { type: String, enum: Object.values(DatasetCollectionTypeEnum) },
          deleted: Boolean
        },
        { _id: false, strict: 'throw' }
      )
    ],
    default: undefined,
    validate: {
      // Mongoose 子文档含内部属性且 datasetId/parentId 为 ObjectId，转为普通对象后统一复用共享 schema 校验。
      validator: (resources: Types.DocumentArray<AuditResourceType>) =>
        AuditResourcesSchema.safeParse(
          resources.toObject().map((item: AuditResourceType) => ({
            ...item,
            ...(item.datasetId ? { datasetId: String(item.datasetId) } : {}),
            ...(item.parentId ? { parentId: String(item.parentId) } : {})
          }))
        ).success,
      message: 'Each audit resource must contain a valid type and an id or name'
    }
  },
  metadata: {
    type: Object,
    default: {}
  }
});

defineIndex(TeamAuditSchema, { key: { teamId: 1, timestamp: -1, _id: -1 } });
defineIndex(TeamAuditSchema, { key: { teamId: 1, tmbId: 1, event: 1 } });
defineIndex(TeamAuditSchema, { key: { event: 1, _id: -1 } });
// 过期审计日志归档任务需按全局 timestamp 范围预筛候选 teamId，不能仅靠 teamId 前缀索引覆盖。
defineIndex(TeamAuditSchema, { key: { timestamp: 1, teamId: 1 } });

export const MongoTeamAudit = getMongoLogModel<TeamAuditSchemaType>(
  TeamAuditCollectionName,
  TeamAuditSchema
);
