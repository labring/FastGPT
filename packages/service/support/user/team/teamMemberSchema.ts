import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type TeamMemberSchema as TeamMemberType } from '@fastgpt/global/support/user/team/type';
import { userCollectionName } from '../../user/schema';
import {
  TeamMemberStatusMap,
  TeamMemberCollectionName,
  TeamCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getRandomUserAvatar } from '@fastgpt/global/support/user/utils';

const TeamMemberSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName,
    required: true
  },
  avatar: {
    type: String,
    default: () => getRandomUserAvatar()
  },
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'Member'
  },
  /**
   * 成员名是否由显式来源设置（本人/管理员/邀请/第三方有效下发）。
   * false 表示 name 是待确认的 username 回落值，非 owner 成员首次登录需强制补齐。
   * 存量文档由迁移任务回填，读取侧经 resolveIsSetMemberName 兼容缺失值。
   */
  isSetMemberName: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: Object.keys(TeamMemberStatusMap)
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date
  },

  /** @deprecated
   * But some code still use this to judge whether the member is a owner.
   * TODO: Remove this field and replace it with a more appropriate way to determine ownership.
   */
  role: {
    type: String
  },
  /** @deprecated */
  defaultTeam: {
    type: Boolean
  }
});

TeamMemberSchema.virtual('team', {
  ref: TeamCollectionName,
  localField: 'teamId',
  foreignField: '_id',
  justOne: true
});
TeamMemberSchema.virtual('user', {
  ref: userCollectionName,
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

defineIndex(TeamMemberSchema, {
  key: { teamId: 1 },
  options: { background: true }
});

defineIndex(TeamMemberSchema, {
  key: { userId: 1, teamId: 1 },
  options: { unique: true, background: true }
});

defineIndex(TeamMemberSchema, {
  key: { userId: 1 },
  deprecated: true,
  options: { background: true }
});

export const MongoTeamMember = getMongoModel<TeamMemberType>(
  TeamMemberCollectionName,
  TeamMemberSchema
);
