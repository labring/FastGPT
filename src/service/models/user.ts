import { Schema, model, models } from 'mongoose';
import { hashPassword } from '@/service/utils/tools';

const UserSchema = new Schema({
  email: {
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
  balance: {
    type: Number,
    default: 0
  },
  accounts: [
    {
      type: {
        type: String,
        required: true,
        enum: ['openai'] // 定义允许的type
      },
      value: {
        type: String,
        required: true
      }
    }
  ],
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

export const User = models['user'] || model('user', UserSchema);
