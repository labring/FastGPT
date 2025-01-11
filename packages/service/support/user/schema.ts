import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';

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
  phonePrefix: {
    type: Number
  },
  password: {
    type: String,
    required: true,
    set: (val: string) => hashStr(val),
    get: (val: string) => hashStr(val),
    select: false
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  promotionRate: {
    type: Number,
    default: 15
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
  lastLoginTmbId: {
    type: Schema.Types.ObjectId
  },

  inviterId: {
    // 谁邀请注册的
    type: Schema.Types.ObjectId,
    ref: userCollectionName
  },
  fastgpt_sem: Object,
  sourceDomain: String,

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
