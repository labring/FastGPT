import type { UpdateQuery, UpdateWithAggregationPipeline } from 'mongoose';
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
import { buildTeamMemberNameSortKey } from './sortKey';

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
   * 基于成员名生成的规范化拼音排序键（0:字母/拼音、1:数字、2:其他），用于团队成员列表按索引排序分页。
   * 存量文档由自动系统迁移任务分批回填。
   */
  nameSortKey: {
    type: String,
    default: function (this: { name?: string } | null | undefined) {
      return buildTeamMemberNameSortKey(this?.name ?? 'Member');
    }
  },
  /**
   * 成员名是否由显式来源设置（本人/管理员/邀请/第三方有效下发）。
   * false 表示 name 是待确认的 username 回落值，成员首次登录需强制补齐；owner 创建时应写为 true。
   * 存量文档由迁移任务回填，读取侧将缺失值按未设置处理。
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
  lastSwitchTime: {
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExplicitSortKey = (target: unknown): boolean =>
  isPlainObject(target) && Object.hasOwn(target, 'nameSortKey') && target.nameSortKey !== undefined;

const syncSortKeyOnOperatorPayload = (target: unknown) => {
  if (!isPlainObject(target)) return;
  if (typeof target.name === 'string' && !hasExplicitSortKey(target)) {
    target.nameSortKey = buildTeamMemberNameSortKey(target.name);
  }
};

/**
 * 在 Mongoose 更新载荷包含 `name` 时自动补齐 `nameSortKey`，防止未显式传排序键的写操作造成漂移。
 * 注意：`bulkWrite` 与聚合管道更新不走此分支，批写入口仍须显式写入 `nameSortKey`。
 */
const syncNameSortKeyInUpdate = (
  update: UpdateQuery<TeamMemberType> | UpdateWithAggregationPipeline | null
) => {
  if (!update || Array.isArray(update)) return;

  if (
    typeof update.name === 'string' &&
    update.nameSortKey === undefined &&
    !hasExplicitSortKey(update.$set)
  ) {
    update.nameSortKey = buildTeamMemberNameSortKey(update.name);
  }
  syncSortKeyOnOperatorPayload(update.$set);
  syncSortKeyOnOperatorPayload(update.$setOnInsert);
};

TeamMemberSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.nameSortKey) {
    this.nameSortKey = buildTeamMemberNameSortKey(this.name);
  }
  next();
});

TeamMemberSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  syncNameSortKeyInUpdate(this.getUpdate());
  next();
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
  key: { teamId: 1, status: 1, nameSortKey: 1, _id: 1 },
  options: { name: 'fg_team_member_status_sort', background: true }
});

export const MongoTeamMember = getMongoModel<TeamMemberType>(
  TeamMemberCollectionName,
  TeamMemberSchema
);
