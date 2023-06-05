import { Schema, model, models, Model } from 'mongoose';
import { hashPassword } from '@/service/utils/tools';
import { PRICE_SCALE } from '@/constants/common';
import { UserModelSchema } from '@/types/mongoSchema';

const UserSchema = new Schema({
  username: {
    // 可以是手机/邮箱，新的验证都只用手机
    type: String,
    required: true,
    unique: true // 唯一
  },
  password: {
    type: String,
    required: true,
    set: (val: string) => hashPassword(val),
    get: (val: string) => hashPassword(val),
    select: false
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/human.png'
  },
  balance: {
    // 平台余额，不可提现
    type: Number,
    default: 2 * PRICE_SCALE
  },
  inviterId: {
    // 谁邀请注册的
    type: Schema.Types.ObjectId,
    ref: 'user'
  },
  promotion: {
    rate: {
      // 返现比例
      type: Number,
      default: 15
    }
  },
  openaiKey: {
    type: String,
    default: ''
  },
  limit: {
    exportKbTime: {
      // Every half hour
      type: Date
    }
  }
});

export const User: Model<UserModelSchema> = models['user'] || model('user', UserSchema);
