import { defineIndex, Schema, getMongoLogModel } from '../../../common/mongo';
import { type TeamAuditSchemaType } from '@fastgpt/global/support/user/audit/type';
import { AdminAuditEventEnum, AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const TeamAuditCollectionName = 'operationLogs';

const TeamAuditSchema = new Schema({
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },
  scope: {
    type: String,
    enum: ['member', 'system'],
    default: 'member'
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
    enum: [...Object.values(AuditEventEnum), ...Object.values(AdminAuditEventEnum)],
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  }
});

defineIndex(TeamAuditSchema, { key: { teamId: 1, tmbId: 1, event: 1 } });
defineIndex(TeamAuditSchema, {
  key: { teamId: 1, event: 1, 'metadata.taskId': 1 },
  options: {
    name: 'teamId_1_event_1_metadata.taskId_1_partial',
    unique: true,
    partialFilterExpression: {
      event: 'SYNC_DATASET',
      'metadata.taskId': { $exists: true }
    }
  }
});
// 训练任务收口按 taskId 反查主事件；taskId 为 UUID，选择性足够，无需再带 event 前缀。
defineIndex(TeamAuditSchema, {
  key: { 'metadata.taskId': 1 },
  options: {
    name: 'metadata.taskId_1_partial',
    partialFilterExpression: { 'metadata.taskId': { $exists: true } }
  }
});
defineIndex(TeamAuditSchema, { key: { timestamp: 1, teamId: 1 } });

export const MongoTeamAudit = getMongoLogModel<TeamAuditSchemaType>(
  TeamAuditCollectionName,
  TeamAuditSchema
);
