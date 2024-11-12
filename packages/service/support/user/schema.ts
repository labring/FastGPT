import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';

export const userCollectionName = 'users';

const defaultAvatars = [
  '/imgs/avatar/RoyalBlueAvatar.svg',
  '/imgs/avatar/PurpleAvatar.svg',
  '/imgs/avatar/AdoraAvatar.svg',
  '/imgs/avatar/OrangeAvatar.svg',
  '/imgs/avatar/RedAvatar.svg',
  '/imgs/avatar/GrayModernAvatar.svg',
  '/imgs/avatar/TealAvatar.svg',
  '/imgs/avatar/GreenAvatar.svg',
  '/imgs/avatar/BrightBlueAvatar.svg',
  '/imgs/avatar/BlueAvatar.svg'
];

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
  avatar: {
    type: String,
    default: defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)]
  },
  inviterId: {
    // 谁邀请注册的
    type: Schema.Types.ObjectId,
    ref: userCollectionName
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
  fastgpt_sem: {
    type: Object
  }
});

try {
  // login
  UserSchema.index({ username: 1, password: 1 });
  UserSchema.index({ createTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);
