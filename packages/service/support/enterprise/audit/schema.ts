import { type EnterpriseAuditLogSchemaType } from '@fastgpt/global/support/enterprise/audit/type';
import { EnterpriseAuditResultEnum } from '@fastgpt/global/support/enterprise/audit/constants';
import { Schema, getMongoLogModel } from '../../../common/mongo';
import { serviceEnv } from '../../../env';

export const EnterpriseAuditLogCollectionName = 'enterpriseAuditLogs';

const EnterpriseAuditLogSchema = new Schema({
  timestamp: {
    type: Date,
    default: () => new Date(),
    expires: serviceEnv.ENTERPRISE_AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60
  },
  action: {
    type: String,
    required: true
  },
  result: {
    type: String,
    enum: Object.values(EnterpriseAuditResultEnum),
    required: true
  },
  actor: {
    type: {
      type: String,
      required: true
    },
    userId: String,
    teamId: String,
    tmbId: String,
    apiKeyId: String,
    name: String
  },
  resource: {
    type: {
      type: String
    },
    id: String,
    name: String
  },
  requestId: String,
  clientIp: String,
  userAgent: String,
  metadata: {
    type: Object,
    default: {}
  }
});

EnterpriseAuditLogSchema.index({ timestamp: -1 });
EnterpriseAuditLogSchema.index({ action: 1, timestamp: -1 });
EnterpriseAuditLogSchema.index({ 'actor.teamId': 1, timestamp: -1 });
EnterpriseAuditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
EnterpriseAuditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, timestamp: -1 });

export const MongoEnterpriseAuditLog = getMongoLogModel<EnterpriseAuditLogSchemaType>(
  EnterpriseAuditLogCollectionName,
  EnterpriseAuditLogSchema
);
