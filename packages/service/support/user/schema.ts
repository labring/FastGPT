import { defineIndex, connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import {
  UserAccountBindingStatusEnum,
  UserTagsSchema,
  type UserModelSchema
} from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';

export const userCollectionName = 'users';

// 历史缺失、null 和空字符串必须保留为“无密码”，不能被哈希成有效摘要。
const hashPasswordValue = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? hashStr(value) : value;

// 外部身份绑定行：无独立 _id，行由 userId + (source, externalId) 定位。
// 一切写入走原子操作符（$push / $set positional / $pull），禁止读-改-写整段数组。
const UserAccountBindingSubSchema = new Schema(
  {
    source: {
      type: String,
      required: true
    },
    externalId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.keys(UserAccountBindingStatusEnum),
      default: UserAccountBindingStatusEnum.active
    },
    matchKey: String,
    matchValue: String,
    lastLoginAt: Date,
    createdAt: {
      type: Date,
      default: () => new Date()
    }
  },
  { _id: false }
);

const UserSchema = new Schema({
  status: {
    type: String,
    enum: Object.keys(userStatusMap),
    default: UserStatusEnum.active
  },
  username: {
    // 可以是手机/邮箱，新的验证都只用手机
    type: String,
    required: true
  },
  password: {
    type: String,
    required: false,
    set: hashPasswordValue,
    get: hashPasswordValue,
    select: false
  },
  passwordUpdateTime: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  openaiAccount: {
    type: {
      key: String,
      baseUrl: String
    }
  },
  timezone: {
    type: String,
    default: 'Asia/Shanghai'
  },
  language: {
    type: String,
    default: LangEnum.zh_CN
  },
  lastLoginTmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },

  fastgpt_sem: Object,

  phonePrefix: Number,
  contact: String,

  tags: {
    type: [String],
    enum: UserTagsSchema.enum
  },
  /** 外部同步来源；设置后同步按来源匹配，不再依赖 username 前缀。 */
  syncSource: {
    type: String,
    required: false
  },
  accounts: {
    type: [UserAccountBindingSubSchema],
    default: undefined
  },
  meta: Object,
  /** @deprecated */
  avatar: String
});

// username 唯一。
defineIndex(UserSchema, {
  key: { username: 1 },
  options: { unique: true }
});
// 管理端用户列表按状态过滤并按 _id 倒序分页，复合索引可同时满足过滤和排序。
defineIndex(UserSchema, { key: { status: 1, _id: -1 } });
// 外部同步按来源筛选成员（存量数据已有 syncSource 字段与索引，声明需与之一致）。
defineIndex(UserSchema, { key: { syncSource: 1 } });
// Admin charts
defineIndex(UserSchema, { key: { createTime: -1 } });
// 登录解析点查 (accounts.source, accounts.externalId)：复合多键索引，非唯一——
// 跨文档唯一性由应用层 bindAccount（锁 + 查重 + 条件 $push）保证；要求 MongoDB ≥ 4.4。
defineIndex(UserSchema, { key: { 'accounts.source': 1, 'accounts.externalId': 1 } });

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);
