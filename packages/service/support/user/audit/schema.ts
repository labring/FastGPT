import { defineIndex, Schema, getMongoLogModel } from '../../../common/mongo';
import {
  AuditResourcesSchema,
  type AuditResourceType,
  type TeamAuditSchemaType
} from '@fastgpt/global/support/user/audit/type';
import type { Types } from 'mongoose';
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
  // 日志库只保存业务资源 ID 快照，不依赖资源继续存在，也不自动 populate 业务库。
  resources: {
    type: [
      new Schema(
        {
          appId: Schema.Types.ObjectId,
          datasetId: Schema.Types.ObjectId,
          skillId: Schema.Types.ObjectId,
          collectionId: Schema.Types.ObjectId
        },
        { _id: false, strict: 'throw' }
      )
    ],
    default: undefined,
    validate: {
      // Mongoose 子文档含内部属性，转为普通对象后再使用共享 union 校验资源互斥性。
      validator: (resources: Types.DocumentArray<AuditResourceType>) =>
        AuditResourcesSchema.safeParse(resources.toObject()).success,
      message: 'Each audit resource must contain exactly one valid resource ID'
    }
  },
  metadata: {
    type: Object,
    default: {}
  }
});

defineIndex(TeamAuditSchema, { key: { teamId: 1, tmbId: 1, event: 1 } });
defineIndex(TeamAuditSchema, { key: { timestamp: 1, teamId: 1 } });

export const MongoTeamAudit = getMongoLogModel<TeamAuditSchemaType>(
  TeamAuditCollectionName,
  TeamAuditSchema
);
