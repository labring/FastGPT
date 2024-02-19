import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import {
  standardSubLevelMap,
  subModeMap,
  subStatusMap,
  subTypeMap
} from '@fastgpt/global/support/wallet/sub/constants';
import type { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

export const subCollectionName = 'team.subscriptions';

const SubSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(subTypeMap),
    required: true
  },
  status: {
    // active: continue sub; canceled: canceled sub;
    type: String,
    enum: Object.keys(subStatusMap),
    required: true
  },
  mode: {
    type: String,
    enum: Object.keys(subModeMap)
  },
  currentMode: {
    type: String,
    enum: Object.keys(subModeMap),
    required: true
  },
  nextMode: {
    type: String,
    enum: Object.keys(subModeMap),
    required: true
  },
  startTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: {
    type: Date,
    required: true
  },
  price: {
    // last sub pay price(total price)
    type: Number,
    required: true
  },
  pointPrice: {
    // stand level point total price
    type: Number
  },

  // sub content
  currentSubLevel: {
    type: String,
    enum: Object.keys(standardSubLevelMap)
  },
  nextSubLevel: {
    type: String,
    enum: Object.keys(standardSubLevelMap)
  },
  totalPoints: {
    type: Number
  },

  currentExtraDatasetSize: {
    type: Number
  },
  nextExtraDatasetSize: {
    type: Number
  },

  currentExtraPoints: {
    type: Number
  },
  nextExtraPoints: {
    type: Number
  },

  surplusPoints: {
    // standard sub / extra points sub
    type: Number
  },

  // abandon
  renew: Boolean, //决定是否续费
  datasetStoreAmount: Number
});

try {
  SubSchema.index({ teamId: 1 });
  SubSchema.index({ status: 1 });
  SubSchema.index({ type: 1 });
  SubSchema.index({ expiredTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamSub: Model<TeamSubSchema> =
  models[subCollectionName] || model(subCollectionName, SubSchema);
