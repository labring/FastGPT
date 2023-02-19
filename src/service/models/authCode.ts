import { Schema, model, models } from 'mongoose';

const AuthCodeSchema = new Schema({
  email: {
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

export const AuthCode = models['auth_code'] || model('auth_code', AuthCodeSchema);
