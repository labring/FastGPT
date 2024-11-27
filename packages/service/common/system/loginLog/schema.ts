import { getMongoModel, Schema } from '../../../common/mongo';
import { LoginLogType } from './type';
import { LoginStatusEnum, LoginTypeEnum } from './constant';

export const LoginLogCollectionName = 'system_login_logs';

export const getLoginLog = () => {
  const LoginLogSchema = new Schema({
    userName: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(LoginStatusEnum)
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(LoginTypeEnum)
    },
    msg: {
      type: String
    },
    ip: {
      type: String
    },
    client: {
      type: String
    },
    time: {
      type: Date,
      required: true,
      default: () => new Date()
    },
    metadata: Object
  });

  LoginLogSchema.index({ time: 1 }, { expires: '7d' });
  LoginLogSchema.index({ userName: 1 });

  return getMongoModel<LoginLogType>(LoginLogCollectionName, LoginLogSchema);
};
