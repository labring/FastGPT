import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import {
  EnterpriseAuthPendingTaskStatuses,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import type {
  EnterpriseAuthTaskType,
  TeamEnterpriseAuthType
} from '@fastgpt/global/support/user/team/enterpriseAuth/type';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import { getLogger, LogCategories } from '../../../../common/logger';

const { Schema } = connectionMongo;

const teamEnterpriseAuthCollectionName = 'team_enterprise_auths';
const teamEnterpriseAuthTaskCollectionName = 'team_enterprise_auth_tasks';

const TeamEnterpriseAuthSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  enterpriseName: { type: String, required: true },
  unifiedCreditCode: { type: String, required: true },
  legalPersonName: { type: String, required: true },
  bankName: { type: String, required: true },
  bankAccount: { type: String, required: true },
  contactName: { type: String, required: true },
  contactTitle: { type: String, required: true },
  contactPhone: { type: String, required: true },
  demand: { type: String, required: true },
  verifiedAt: { type: Date, required: true },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

const TeamEnterpriseAuthTaskSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  userId: { type: Schema.Types.ObjectId },
  tmbId: { type: Schema.Types.ObjectId },
  taskId: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(TeamEnterpriseAuthTaskStatusEnum),
    required: true
  },
  enterpriseName: { type: String, required: true },
  unifiedCreditCode: { type: String, required: true },
  legalPersonName: { type: String, required: true },
  bankName: { type: String, required: true },
  bankAccount: { type: String, required: true },
  contactName: { type: String, required: true },
  contactTitle: { type: String, required: true },
  contactPhone: { type: String, required: true },
  demand: { type: String, required: true },
  orderId: String,
  transferAmountFen: Number,
  transferRespCode: String,
  transferRespMsg: String,
  grantExpiredAt: Date,
  amountErrorTimes: { type: Number, required: true, default: 0 },
  usedTimes: { type: Number, required: true, default: 0 },
  lastErrorCode: String,
  lastErrorMessage: String,
  startedAt: { type: Date, required: true },
  expireAt: Date,
  endedAt: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

TeamEnterpriseAuthSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

TeamEnterpriseAuthTaskSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

try {
  TeamEnterpriseAuthSchema.index({ teamId: 1 }, { unique: true });
  TeamEnterpriseAuthSchema.index({ unifiedCreditCode: 1 }, { unique: true });

  TeamEnterpriseAuthTaskSchema.index({ teamId: 1 }, { unique: true });
  TeamEnterpriseAuthTaskSchema.index({ teamId: 1, taskId: 1 });
  TeamEnterpriseAuthTaskSchema.index({ unifiedCreditCode: 1, status: 1 });
  TeamEnterpriseAuthTaskSchema.index(
    { unifiedCreditCode: 1 },
    {
      unique: true,
      partialFilterExpression: {
        status: { $in: [...EnterpriseAuthPendingTaskStatuses] }
      }
    }
  );
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build team enterprise auth indexes', { error });
}

export const MongoTeamEnterpriseAuth = getMongoModel<TeamEnterpriseAuthType>(
  teamEnterpriseAuthCollectionName,
  TeamEnterpriseAuthSchema
);

export const MongoTeamEnterpriseAuthTask = getMongoModel<EnterpriseAuthTaskType>(
  teamEnterpriseAuthTaskCollectionName,
  TeamEnterpriseAuthTaskSchema
);
