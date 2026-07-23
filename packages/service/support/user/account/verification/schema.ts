import { AccountVerificationMaterialTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import type {
  AccountVerificationPurpose,
  CodeAccountVerificationScene
} from '@fastgpt/global/support/user/account/verification/type';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';

const { Schema } = connectionMongo;

export type AccountVerificationMaterialSchemaType = {
  key: string;
  type: `${AccountVerificationMaterialTypeEnum}`;
  code?: string;
  openid?: string;
  userIdHash?: string;
  purpose?: AccountVerificationPurpose;
  scene?: CodeAccountVerificationScene;
  provider?: string;
  callbackHash?: string;
  createTime: Date;
  expiredTime: Date;
};

const AccountVerificationMaterialSchema = new Schema<AccountVerificationMaterialSchemaType>({
  key: {
    type: String,
    required: true
  },
  code: {
    type: String,
    minLength: 6,
    maxLength: 6
  },
  openid: String,
  userIdHash: String,
  purpose: String,
  scene: String,
  provider: String,
  callbackHash: String,
  type: {
    type: String,
    enum: Object.values(AccountVerificationMaterialTypeEnum),
    required: true
  },
  createTime: {
    type: Date,
    required: true
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

// 唯一索引需在生产重复数据清理后单独上线，本轮先保持兼容索引。
AccountVerificationMaterialSchema.index({ key: 1, type: 1 });
AccountVerificationMaterialSchema.index({ userIdHash: 1 }, { sparse: true });
AccountVerificationMaterialSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 0 });

export const MongoAccountVerificationMaterial =
  getMongoModel<AccountVerificationMaterialSchemaType>(
    'auth_codes',
    AccountVerificationMaterialSchema
  );
