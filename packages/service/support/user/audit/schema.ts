import { Schema, getMongoLogModel } from '../../../common/mongo';
import { type OperationLogSchema } from '@fastgpt/global/support/user/audit/type';
import { AdminAuditEventEnum, AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const OperationLogCollectionName = 'operationLogs';

const OperationLogSchema = new Schema({
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

OperationLogSchema.index({ teamId: 1, tmbId: 1, event: 1 });
OperationLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 }); // Auto delete after 14 days

export const MongoOperationLog = getMongoLogModel<OperationLogSchema>(
  OperationLogCollectionName,
  OperationLogSchema
);
