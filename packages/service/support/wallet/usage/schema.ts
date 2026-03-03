import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type UsageSchemaType } from '@fastgpt/global/support/wallet/usage/type';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { UsageCollectionName, UsageItemCollectionName } from './constants';
import { AppCollectionName } from '../../../core/app/schema';
import { DatasetCollectionName } from '../../../core/dataset/schema';

const UsageSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: TeamMemberCollectionName,
      required: true
    },
    source: {
      type: String,
      enum: Object.values(UsageSourceEnum),
      required: true
    },
    // usage name
    appName: {
      type: String,
      default: ''
    },
    // total points
    totalPoints: {
      type: Number,
      required: true
    },
    time: {
      type: Date,
      default: () => new Date()
    },

    appId: {
      type: Schema.Types.ObjectId,
      ref: AppCollectionName
    },
    datasetId: {
      type: Schema.Types.ObjectId,
      ref: DatasetCollectionName
    },

    // @description It will not be used again in the future.
    list: {
      type: Array
    }
  },
  {
    // Auto update time
    timestamps: {
      updatedAt: 'time'
    }
  }
);

UsageSchema.virtual('usageItems', {
  ref: UsageItemCollectionName,
  localField: '_id',
  foreignField: 'usageId'
});

try {
  UsageSchema.index({ teamId: 1, tmbId: 1, source: 1, time: 1, appName: 1, _id: -1 });

  UsageSchema.index({ time: 1 }, { expireAfterSeconds: 360 * 24 * 60 * 60 });
} catch (error) {
  console.log(error);
}

export const MongoUsage = getMongoModel<UsageSchemaType>(UsageCollectionName, UsageSchema);
