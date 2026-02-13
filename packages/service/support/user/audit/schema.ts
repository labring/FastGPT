import { Schema, getMongoLogModel } from '../../../common/mongo';
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
    ref: TeamMemberCollectionName,
    required: true
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

TeamAuditSchema.index({ teamId: 1, tmbId: 1, event: 1 });
TeamAuditSchema.index({ timestamp: 1, teamId: 1 });

export const MongoTeamAudit = getMongoLogModel<TeamAuditSchemaType>(
  TeamAuditCollectionName,
  TeamAuditSchema
);
