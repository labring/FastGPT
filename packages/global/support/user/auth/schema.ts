import { connectionMongo, getMongoModel, type Model } from '../../../../service/common/mongo';
const { Schema, model, models } = connectionMongo;
import type { UserAuthSchemaType } from '../../../../../../projects/app/src/global/support/user/auth/type';
import { UserAuthTypeEnum, userAuthTypeMap } from './constants';

/* 
    user account auth
    1. login
  2. register 
  3. find password 
  4. wx login 
  5. captcha 
*/

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
  openid: {
    // wx openid
    type: String
  },
  type: {
    type: String,
    enum: Object.keys(userAuthTypeMap),
    required: true
  },
  createTime: {
    type: Date,
    default: () => Date.now()
  },
  outdateTime: {
    type: Date,
    default: () => Date.now() + 60 * 5 * 1000
  }
});

try {
  UserAuthSchema.index({ key: 1, type: 1 });
  UserAuthSchema.index({ outdateTime: 1 }, { expireAfterSeconds: 0 });
} catch (error) {
  console.log(error);
}

export const MongoUserAuth = getMongoModel<UserAuthSchemaType>('auth_code', UserAuthSchema);
