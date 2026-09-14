import { defineIndex, connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserTagsSchema, type UserModelSchema } from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';

export const userCollectionName = 'users';

// 历史缺失、null 和空字符串必须保留为“无密码”，不能被哈希成有效摘要。
const hashPasswordValue = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? hashStr(value) : value;

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
  meta: Object,
  /** @deprecated */
  avatar: String
});

// username 唯一。
defineIndex(UserSchema, {
  key: { username: 1 },
  options: { unique: true }
});
// Admin charts
defineIndex(UserSchema, { key: { createTime: -1 } });

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);
