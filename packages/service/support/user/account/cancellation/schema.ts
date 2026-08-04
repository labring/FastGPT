import {
  AccountCancellationStatusEnum,
  accountCancellationStatusMap
} from '@fastgpt/global/support/user/account/cancellation/constants';
import type { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/type';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { Types } from 'mongoose';
import { userCollectionName } from '../../schema';

const { Schema } = connectionMongo;

export const accountCancellationCollectionName = 'account_cancellation';

export type AccountCancellationSchemaType = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: AccountCancellationStatus;
  requestedAt: Date;
};

const AccountCancellationSchema = new Schema<AccountCancellationSchemaType>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: userCollectionName,
      required: true
    },
    status: {
      type: String,
      enum: Object.keys(accountCancellationStatusMap),
      required: true
    },
    requestedAt: {
      type: Date,
      required: true
    }
  },
  {
    collection: accountCancellationCollectionName,
    timestamps: false,
    versionKey: false
  }
);

AccountCancellationSchema.index({ userId: 1 }, { unique: true });
AccountCancellationSchema.index({ status: 1, requestedAt: 1 });

export const MongoAccountCancellation = getMongoModel<AccountCancellationSchemaType>(
  accountCancellationCollectionName,
  AccountCancellationSchema
);

export { AccountCancellationStatusEnum };
