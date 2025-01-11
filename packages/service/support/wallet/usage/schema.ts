import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { UsageSchemaType } from '@fastgpt/global/support/wallet/usage/type';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const UsageCollectionName = 'usages';

const UsageSchema = new Schema({
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
  appName: {
    // usage name
    type: String,
    default: ''
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'apps',
    required: false
  },
  pluginId: {
    type: Schema.Types.ObjectId,
    ref: 'plugins',
    required: false
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  totalPoints: {
    // total points
    type: Number,
    required: true
  },
  // total: {
  //   // total points
  //   type: Number,
  //   required: true
  // },
  list: {
    type: Array,
    default: []
  }
});

try {
  UsageSchema.index({ teamId: 1, tmbId: 1, source: 1, time: -1 });
  // timer task. clear dead team
  // UsageSchema.index({ teamId: 1, time: -1 });

  UsageSchema.index({ time: 1 }, { expireAfterSeconds: 360 * 24 * 60 * 60 });
} catch (error) {
  console.log(error);
}

export const MongoUsage = getMongoModel<UsageSchemaType>(UsageCollectionName, UsageSchema);
