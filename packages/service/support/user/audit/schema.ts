import { defineIndex, Schema, getMongoLogModel } from '../../../common/mongo';
import {
  AuditResourcesSchema,
  type AuditResourceType,
  type TeamAuditSchemaType
} from '@fastgpt/global/support/user/audit/type';
import type { Types } from 'mongoose';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
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
  // 保存资源 ID、父级定位信息及操作时类型快照，不依赖资源继续存在，也不自动 populate 业务库。
  resources: {
    type: [
      new Schema(
        {
          appId: Schema.Types.ObjectId,
          appType: { type: String, enum: Object.values(AppTypeEnum) },
          datasetId: Schema.Types.ObjectId,
          skillId: Schema.Types.ObjectId,
          collectionId: Schema.Types.ObjectId,
          collectionType: { type: String, enum: Object.values(DatasetCollectionTypeEnum) }
        },
        { _id: false, strict: 'throw' }
      )
    ],
    default: undefined,
    validate: {
      // Mongoose 子文档含内部属性，转为普通对象后再校验唯一主资源及可选父级上下文。
      validator: (resources: Types.DocumentArray<AuditResourceType>) =>
        AuditResourcesSchema.safeParse(resources.toObject()).success,
      message:
        'Each audit item must identify one resource; collections may include their dataset context'
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
