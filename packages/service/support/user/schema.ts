import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';

export const userCollectionName = 'users';

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
    required: true,
    set: (val: string) => hashStr(val),
    get: (val: string) => hashStr(val),
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
  sourceDomain: String,

  phonePrefix: Number,
  contact: String,

  /** @deprecated */
  avatar: String
});

try {
  // Admin charts
  UserSchema.index({ createTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);
