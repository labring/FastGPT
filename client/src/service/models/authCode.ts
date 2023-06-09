import { Schema, model, models, Model } from 'mongoose';
import { AuthCodeSchema as AuthCodeType } from '@/types/mongoSchema';

const AuthCodeSchema = new Schema({
  username: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    length: 6
  },
  type: {
    type: String,
    enum: ['register', 'findPassword'],
    required: true
  },
  expiredTime: {
    type: Number,
    default: () => Date.now() + 5 * 60 * 1000
  }
});

export const AuthCode: Model<AuthCodeType> =
  models['auth_code'] || model('auth_code', AuthCodeSchema);
