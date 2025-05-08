import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { UserAuthSchemaType } from '@fastgpt/global/support/user/auth/type';
import { userAuthTypeMap } from '@fastgpt/global/support/user/auth/constants';
import { addMinutes } from 'date-fns';

const UserAuthSchema = new Schema({
  key: {
    type: String,
    required: true
  },
  code: {
    // auth code
    type: String,
    length: 6
  },
  // wx openid
  openid: String,
  type: {
    type: String,
    enum: Object.keys(userAuthTypeMap),
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: {
    type: Date,
    default: () => addMinutes(new Date(), 5)
  }
});

try {
  UserAuthSchema.index({ key: 1, type: 1 });
  UserAuthSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 0 });
} catch (error) {
  console.log(error);
}

export const MongoUserAuth = getMongoModel<UserAuthSchemaType>('auth_codes', UserAuthSchema);
