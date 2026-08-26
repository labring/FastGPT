import {
  AccountCancellationStatus as AccountCancellationStatusValues,
  accountCancellationStatusMap
} from '@fastgpt/global/support/user/account/cancellation/constants';
import type { AccountCancellationStatus as AccountCancellationStatusType } from '@fastgpt/global/support/user/account/cancellation/type';
import { connectionMongo, defineIndex, getMongoModel } from '../../../../common/mongo';
import type { Types } from 'mongoose';
import { userCollectionName } from '../../schema';

const { Schema } = connectionMongo;

export const accountCancellationCollectionName = 'account_cancellation';

export type AccountCancellationSchemaType = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: AccountCancellationStatusType;
  requestedAt: Date;
  notificationStatus: number;
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
    },
    notificationStatus: {
      type: Number,
      required: true,
      default: 0
    }
  },
  {
    collection: accountCancellationCollectionName,
    timestamps: false,
    versionKey: false
  }
);

defineIndex(AccountCancellationSchema, {
  key: { userId: 1 },
  options: { unique: true }
});

defineIndex(AccountCancellationSchema, {
  key: { status: 1, requestedAt: 1 }
});

export const MongoAccountCancellation = getMongoModel<AccountCancellationSchemaType>(
  accountCancellationCollectionName,
  AccountCancellationSchema
);

export { AccountCancellationStatusValues as AccountCancellationStatus };
