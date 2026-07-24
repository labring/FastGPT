import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import { UserTagsSchema, type UserModelSchema } from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { getLogger, LogCategories } from '../../common/logger';

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
    required: true,
    unique: true // 唯一
  },
  password: {
    type: String,
    set: hashPasswordValue,
    get: hashPasswordValue,
    select: false
  },
  passwordUpdateTime: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  promotionRate: {
    type: Number,
    default: 0
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

  inviterId: {
    // 谁邀请注册的
    type: Schema.Types.ObjectId,
    ref: userCollectionName
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

try {
  // Admin charts
  UserSchema.index({ createTime: -1 });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build user indexes', { error });
}

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);
