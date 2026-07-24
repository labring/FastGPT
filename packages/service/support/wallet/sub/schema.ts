/*
  user sub plan
  1. type=standard: There will only be 1, and each team will have one
  2. type=extraDatasetSize/extraPoints: Can buy multiple
*/
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import type { TeamSubSchemaType } from '@fastgpt/global/support/wallet/sub/type';

export const subCollectionName = 'team_subscriptions';

const SubSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(SubTypeEnum),
    required: true
  },
  startTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: {
    type: Date,
    required: true
  },

  // standard sub
  currentMode: {
    type: String,
    enum: Object.values(SubModeEnum)
  },
  nextMode: {
    type: String,
    enum: Object.values(SubModeEnum)
  },
  currentSubLevel: {
    type: String,
    enum: Object.values(StandardSubLevelEnum)
  },
  nextSubLevel: {
    type: String,
    enum: Object.values(StandardSubLevelEnum)
  },
  maxTeamMember: Number,
  maxApp: Number,
  maxDataset: Number,

  // custom level configurations
  requestsPerMinute: Number,
  chatHistoryStoreDuration: Number,
  maxDatasetSize: Number,
  websiteSyncPerDataset: Number,
  appRegistrationCount: Number,
  auditLogStoreDuration: Number,
  ticketResponseTime: Number,
  customDomain: Number,

  maxUploadFileSize: Number,
  maxUploadFileCount: Number,

  enableSandbox: Boolean, // 虚拟机

  // stand sub and extra points sub. Plan total points
  totalPoints: Number,
  // plan surplus points
  surplusPoints: Number,

  // extra dataset size
  currentExtraDatasetSize: Number
});

// Get plan by expiredTime
defineIndex(SubSchema, { key: { expiredTime: -1, currentSubLevel: 1 } });

// Get team plan
defineIndex(SubSchema, { key: { teamId: 1, type: 1, expiredTime: -1 } });
// timer task. Get standard plan;Get free plan;Clear expired extract plan
defineIndex(SubSchema, {
  key: { type: 1, expiredTime: -1, currentSubLevel: 1 }
});

// 修改后的唯一索引
defineIndex(SubSchema, {
  key: {
    teamId: 1,
    type: 1,
    currentSubLevel: 1
  },
  options: {
    unique: true,
    partialFilterExpression: { type: SubTypeEnum.standard }
  }
});

export const MongoTeamSub = getMongoModel<TeamSubSchemaType>(subCollectionName, SubSchema);
